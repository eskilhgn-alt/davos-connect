/**
 * shot-draw — server-side start / finalize / repair for Shot-trekning.
 *
 * CODE ONLY: ikke deployet. Krever ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY
 * i Edge-env (aldri i klienten).
 *
 * Kontrakt:
 *   POST { action: "start",    trip_id, idempotency_key }
 *   POST { action: "finalize", draw_id }
 *   POST { action: "repair",   trip_id }
 *   POST { action: "state",    trip_id }
 * Svar inkluderer alltid `server_now` for klokkeskew på klienten.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = Deno.env.get("APP_URL") || "https://guttahutte.lovable.app";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface DrawState {
  server_now: string;
  draw: {
    id: string;
    trip_id: string;
    initiated_by: string;
    status: "countdown" | "finalized";
    draw_at: string;
    finalized_at: string | null;
    participant_count: number;
    winner_id: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "server_configuration" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    // Caller-scoped client: alle RPC-er kjører med brukerens auth.uid(),
    // så medlemskap/tur håndheves server-side i databasen.
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    const action = body.action;

    const loadState = async (tripId: string): Promise<DrawState> => {
      const { data, error } = await caller.rpc("rpc_shot_current", { p_trip_id: tripId });
      if (error) throw new Error(error.message);
      return data as DrawState;
    };

    /** Kvalifiserte mottakere utledes alltid server-side fra valgt trip_id. */
    const recipients = async (tripId: string): Promise<string[]> => {
      const { data: members } = await admin
        .from("trip_members")
        .select("user_id, profiles!inner(id, membership_status, is_active, is_banned)")
        .eq("trip_id", tripId)
        .eq("profiles.membership_status", "approved")
        .eq("profiles.is_active", true);
      const ids = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
      if (ids.size === 0) return [];
      const { data: tokens } = await admin
        .from("push_tokens")
        .select("user_id")
        .in("user_id", Array.from(ids))
        .not("player_id", "is", null);
      return Array.from(new Set((tokens ?? []).map((t: { user_id: string }) => t.user_id)));
    };

    const push = async (
      dedupeKey: string,
      tripId: string,
      drawId: string,
      heading: string,
      content: string,
    ) => {
      const appId = Deno.env.get("ONESIGNAL_APP_ID");
      const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
      if (!appId || !restKey) return { sent: 0, reason: "push_not_configured" };

      const { error: claimError } = await admin.from("notification_dispatches").insert({
        dedupe_key: dedupeKey,
        kind: "shot",
        source_id: drawId,
        event_type: dedupeKey.endsWith(":start") ? "start" : "result",
      });
      if (claimError?.code === "23505") return { sent: 0, reason: "already_dispatched" };
      if (claimError) throw claimError;

      const targets = await recipients(tripId);
      if (targets.length === 0) {
        await admin.from("notification_dispatches").delete().eq("dedupe_key", dedupeKey);
        return { sent: 0, reason: "no_recipients" };
      }

      const res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Key ${restKey}` },
        body: JSON.stringify({
          app_id: appId,
          include_aliases: { external_id: targets },
          target_channel: "push",
          headings: { en: heading },
          contents: { en: content },
          url: `${APP_URL}/shot?draw=${encodeURIComponent(drawId)}`,
          data: { kind: "shot", draw_id: drawId, trip_id: tripId },
          collapse_id: dedupeKey,
        }),
      });
      if (!res.ok) {
        // Frigi claim slik at reparasjon kan prøve på nytt.
        await admin.from("notification_dispatches").delete().eq("dedupe_key", dedupeKey);
        return { sent: 0, reason: "onesignal_error" };
      }
      await admin
        .from("notification_dispatches")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("dedupe_key", dedupeKey);
      return { sent: targets.length };
    };

    const finalizeAndAnnounce = async (drawId: string) => {
      const { data, error } = await caller.rpc("rpc_shot_finalize", { p_draw_id: drawId });
      if (error) throw new Error(error.message);
      const state = data as DrawState;
      const draw = state?.draw;
      if (draw?.status === "finalized" && draw.winner_id) {
        const { data: p } = await admin
          .from("profiles")
          .select("nickname, full_name")
          .eq("id", draw.winner_id)
          .maybeSingle();
        const name = p?.nickname || p?.full_name || "Noen";
        await push(
          `shot:${draw.id}:result`,
          draw.trip_id,
          draw.id,
          "Shot-trekning",
          `${name} fikk shot`,
        );
      }
      return state;
    };

    if (action === "state") {
      if (!body.trip_id) return json({ error: "trip_required" }, 400);
      return json(await loadState(body.trip_id));
    }

    if (action === "start") {
      if (!body.trip_id || !body.idempotency_key) return json({ error: "bad_request" }, 400);
      const { data, error } = await caller.rpc("rpc_shot_start", {
        p_trip_id: body.trip_id,
        p_idempotency_key: body.idempotency_key,
      });
      if (error) return json({ error: error.message }, 400);
      const state = data as DrawState;
      if (state?.draw) {
        await push(
          `shot:${state.draw.id}:start`,
          state.draw.trip_id,
          state.draw.id,
          "Shot-trekning",
          "Shot-trekning starter – 10 sekunder",
        );
      }
      return json(state);
    }

    if (action === "finalize") {
      if (!body.draw_id) return json({ error: "bad_request" }, 400);
      return json(await finalizeAndAnnounce(body.draw_id));
    }

    if (action === "repair") {
      if (!body.trip_id) return json({ error: "trip_required" }, 400);
      const { data: due, error } = await caller.rpc("rpc_shot_due_draws", {
        p_trip_id: body.trip_id,
      });
      if (error) return json({ error: error.message }, 400);
      for (const id of (due ?? []) as string[]) {
        await finalizeAndAnnounce(id);
      }
      return json(await loadState(body.trip_id));
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("shot-draw error", err);
    return json({ error: err instanceof Error ? err.message : "internal" }, 500);
  }
});
