/**
 * shot-draw — server-side start / finalize / repair / sweep for Shot-trekning.
 *
 * CODE ONLY: ikke deployet. Krever ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY
 * og SHOT_SWEEP_SECRET i Edge-env (aldri i klienten).
 *
 * Kontrakt:
 *   POST { action: "start",    trip_id, idempotency_key }   (bruker-JWT)
 *   POST { action: "finalize", draw_id }                    (bruker-JWT)
 *   POST { action: "repair",   trip_id }                    (bruker-JWT)
 *   POST { action: "state",    trip_id }                    (bruker-JWT)
 *   POST { action: "sweep" }   + header x-shot-sweep-secret (bakgrunnsjobb)
 * Svar inkluderer alltid `server_now` for klokkeskew på klienten.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleShot, type ClaimResult, type ShotDeps } from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shot-sweep-secret",
};

const APP_URL = Deno.env.get("APP_URL") || "https://guttahutte.lovable.app";

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return respond({ error: "server_configuration" }, 500);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const sweepSecret = Deno.env.get("SHOT_SWEEP_SECRET");
    const isService =
      body.action === "sweep" &&
      !!sweepSecret &&
      req.headers.get("x-shot-sweep-secret") === sweepSecret;

    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let caller = admin;
    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return respond({ error: "unauthorized" }, 401);
      caller = createClient(url, anon, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userErr } = await caller.auth.getUser();
      if (userErr || !userData.user) return respond({ error: "unauthorized" }, 401);
    } else if (body.action === "sweep" && !sweepSecret) {
      return respond({ error: "unauthorized" }, 401);
    }

    const deps: ShotDeps = {
      now: () => new Date().toISOString(),

      callerRpc: async (name, args) => {
        const { data, error } = await caller.rpc(name, args);
        if (error) throw new Error(error.message);
        return data;
      },
      serviceRpc: async (name, args) => {
        const { data, error } = await admin.rpc(name, args);
        if (error) throw new Error(error.message);
        return data;
      },

      /** Nøyaktig samme kvalifiseringsregel som trekningens snapshot. */
      eligibleRecipients: async (tripId) => {
        const { data: members } = await admin
          .from("trip_members")
          .select("user_id, profiles!inner(id, membership_status, is_active, is_banned)")
          .eq("trip_id", tripId)
          .eq("profiles.membership_status", "approved")
          .eq("profiles.is_active", true)
          .eq("profiles.is_banned", false);
        const ids = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
        if (ids.size === 0) return [];
        const { data: tokens } = await admin
          .from("push_tokens")
          .select("user_id")
          .in("user_id", Array.from(ids))
          .not("player_id", "is", null);
        return Array.from(new Set((tokens ?? []).map((t: { user_id: string }) => t.user_id)));
      },

      displayName: async (userId) => {
        const { data } = await admin
          .from("profiles")
          .select("nickname, full_name")
          .eq("id", userId)
          .maybeSingle();
        return data?.nickname || data?.full_name || "Noen";
      },

      claimDispatch: async (dedupeKey, meta): Promise<ClaimResult> => {
        const { error } = await admin.from("notification_dispatches").insert({
          dedupe_key: dedupeKey,
          kind: meta.kind,
          source_id: meta.sourceId,
          event_type: meta.eventType,
        });
        if (!error) return "claimed";
        if (error.code !== "23505") throw error;

        const { data: existing } = await admin
          .from("notification_dispatches")
          .select("sent_at")
          .eq("dedupe_key", dedupeKey)
          .maybeSingle();
        if (existing?.sent_at) return "already_sent";
        // Ikke-destruktiv retry: behold raden, tell forsøk.
        await admin
          .from("notification_dispatches")
          .update({ claimed_at: new Date().toISOString() })
          .eq("dedupe_key", dedupeKey)
          .is("sent_at", null);
        return "retry";
      },

      markDispatchSent: async (dedupeKey) => {
        await admin
          .from("notification_dispatches")
          .update({ sent_at: new Date().toISOString(), last_error: null })
          .eq("dedupe_key", dedupeKey);
      },

      markDispatchFailed: async (dedupeKey, message) => {
        await admin
          .from("notification_dispatches")
          .update({ last_error: message })
          .eq("dedupe_key", dedupeKey);
      },

      sendPush: async ({ dedupeKey, tripId, drawId, heading, content, recipients }) => {
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
        if (!appId || !restKey) return false;
        const res = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Key ${restKey}` },
          body: JSON.stringify({
            app_id: appId,
            include_aliases: { external_id: recipients },
            target_channel: "push",
            headings: { en: heading },
            contents: { en: content },
            url: `${APP_URL}/shot?draw=${encodeURIComponent(drawId)}`,
            data: { kind: "shot", draw_id: drawId, trip_id: tripId },
            collapse_id: dedupeKey,
          }),
        });
        return res.ok;
      },
    };

    const result = await handleShot(body, deps, { isService });
    return respond(result.body, result.status);
  } catch (err) {
    console.error("shot-draw error", err);
    return respond({ error: err instanceof Error ? err.message : "internal" }, 500);
  }
});
