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
 *
 * verify_jwt = false i config fordi sweep autentiseres med konstant-tids
 * hemmelighetssjekk. Alle andre actions krever gyldig bruker-JWT her i koden.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handleShot,
  isOneSignalAccepted,
  type ClaimOutcome,
  type ShotDeps,
} from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shot-sweep-secret",
};

const APP_URL = Deno.env.get("APP_URL") || "https://guttahutte.lovable.app";
/** Bakgrunnsventing er begrenset, slik at Edge-invokasjonen ikke henger. */
const MAX_BACKGROUND_WAIT_MS = 120_000;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Konstant-tids sammenligning for delt hemmelighet. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function runInBackground(work: () => Promise<void>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  const promise = work().catch((err) => console.error("shot-draw background", err));
  if (runtime?.waitUntil) runtime.waitUntil(promise);
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
    const providedSecret = req.headers.get("x-shot-sweep-secret") ?? "";
    const isService =
      body.action === "sweep" && !!sweepSecret && safeEqual(providedSecret, sweepSecret);

    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let caller = admin;
    if (!isService) {
      if (body.action === "sweep") return respond({ error: "unauthorized" }, 401);
      if (!authHeader.startsWith("Bearer ")) return respond({ error: "unauthorized" }, 401);
      caller = createClient(url, anon, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userErr } = await caller.auth.getUser();
      if (userErr || !userData.user) return respond({ error: "unauthorized" }, 401);
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

      /**
       * Mottakere = trekningens frosne snapshot. Medlemsendringer etter start
       * påvirker aldri settet. Kun leverbare pushaliaser tas med.
       */
      snapshotRecipients: async (drawId) => {
        const { data: snap } = await admin
          .from("shot_draw_participants")
          .select("user_id")
          .eq("draw_id", drawId);
        const ids = Array.from(new Set((snap ?? []).map((r: { user_id: string }) => r.user_id)));
        if (ids.length === 0) return [];
        const { data: tokens } = await admin
          .from("push_tokens")
          .select("user_id")
          .in("user_id", ids)
          .not("player_id", "is", null);
        const deliverable = new Set((tokens ?? []).map((t: { user_id: string }) => t.user_id));
        return ids.filter((id) => deliverable.has(id));
      },

      displayName: async (userId) => {
        const { data } = await admin
          .from("profiles")
          .select("nickname, full_name")
          .eq("id", userId)
          .maybeSingle();
        return data?.nickname || data?.full_name || "Noen";
      },

      /** Atomisk CAS + lease i DB. Aldri DELETE. */
      claimDispatch: async (dedupeKey, meta): Promise<ClaimOutcome> => {
        const { data, error } = await admin.rpc("rpc_notification_dispatch_claim", {
          p_dedupe_key: dedupeKey,
          p_kind: meta.kind,
          p_source_id: meta.sourceId,
          p_event_type: meta.eventType,
        });
        if (error) throw new Error(error.message);
        const row = data as {
          status: ClaimOutcome["status"];
          lease_token: string | null;
          provider_idempotency_key: string | null;
          attempts: number | null;
        };
        return {
          status: row.status,
          leaseToken: row.lease_token,
          providerIdempotencyKey: row.provider_idempotency_key,
          attempts: row.attempts ?? 0,
        };
      },

      markDispatchSent: async (dedupeKey, leaseToken, recipientCount) => {
        const { data, error } = await admin.rpc("rpc_notification_dispatch_mark_sent", {
          p_dedupe_key: dedupeKey,
          p_lease_token: leaseToken,
          p_recipient_count: recipientCount,
        });
        if (error) throw new Error(error.message);
        return data === true;
      },

      markDispatchFailed: async (dedupeKey, leaseToken, message) => {
        const { error } = await admin.rpc("rpc_notification_dispatch_mark_failed", {
          p_dedupe_key: dedupeKey,
          p_lease_token: leaseToken,
          p_error: message,
        });
        if (error) console.error("mark_failed", error.message);
      },

      sendPush: async ({
        providerIdempotencyKey,
        tripId,
        drawId,
        heading,
        content,
        recipients,
      }) => {
        const appId = Deno.env.get("ONESIGNAL_APP_ID");
        const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
        if (!appId || !restKey) return false;
        const res = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${restKey}`,
            // Stabil på tvers av retries: provider dedupliserer selv om
            // mark_sent feilet etter at pushen ble akseptert.
            "Idempotency-Key": providerIdempotencyKey,
          },
          body: JSON.stringify({
            app_id: appId,
            idempotency_key: providerIdempotencyKey,
            external_id: providerIdempotencyKey,
            include_aliases: { external_id: recipients },
            target_channel: "push",
            headings: { en: heading },
            contents: { en: content },
            url: `${APP_URL}/shot?draw=${encodeURIComponent(drawId)}`,
            data: { kind: "shot", draw_id: drawId, trip_id: tripId },
            collapse_id: providerIdempotencyKey,
          }),
        });
        // HTTP 200 alene er ikke bevis: OneSignal svarer 200 også når
        // varselet ikke ble opprettet (f.eks. «All included players are
        // not subscribed»). Krev en faktisk meldings-ID.
        const payload = await res.json().catch(() => null);
        return isOneSignalAccepted(res.status, payload);
      },

      background: runInBackground,

      sleepUntil: async (iso) => {
        const ms = Math.min(Math.max(Date.parse(iso) - Date.now(), 0), MAX_BACKGROUND_WAIT_MS);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      },

      logError: (scope, err) => console.error(`shot-draw ${scope}`, err),
    };

    const result = await handleShot(body, deps, { isService });
    return respond(result.body, result.status);
  } catch (err) {
    console.error("shot-draw error", err);
    return respond({ error: err instanceof Error ? err.message : "internal" }, 500);
  }
});
