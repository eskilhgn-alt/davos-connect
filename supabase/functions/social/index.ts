// PREPARED. Disabled unless explicitly enabled AFTER the activation gates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { runWorker, validateCommand } from "./core.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, x-social-worker-secret",
  "Content-Type": "application/json",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
function equal(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST")
    return response({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("SOCIAL_ENABLED") !== "true")
    return response({ error: "not_activated" }, 503);
  try {
    if (Number(req.headers.get("content-length")) > 4096)
      return response({ error: "body_too_large" }, 413);
    const text = await req.text();
    if (text.length > 4096) return response({ error: "body_too_large" }, 413);
    const body = JSON.parse(text);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    };
    const work = () =>
      runWorker({
        tick: () => rpc("social_tick"),
        claim: () => rpc("social_outbox_claim", { p_limit: 5 }),
        payload: async (row) => {
          const approved = await rpc("is_approved_trip_member", {
            _trip_id: row.trip_id,
            _user_id: row.recipient_id,
          });
          const active = await rpc("is_trip_active", { _trip_id: row.trip_id });
          if (!approved || !active) return null;
          const { data: e, error } = await admin
            .from("social_events")
            .select("id,kind,title,body")
            .eq("id", row.event_id)
            .single();
          if (error) throw error;
          const appUrl = Deno.env.get("APP_URL");
          if (!appUrl || !appUrl.startsWith("https://"))
            throw new Error("app_url_required");
          const path = e.kind === "vibe" ? "/stemning" : "/shot";
          return {
            title: e.title,
            body: e.body,
            event_id: e.id,
            trip_id: row.trip_id,
            url: `${appUrl.replace(/\/$/, "")}${path}?trip=${row.trip_id}&event=${e.id}`,
          };
        },
        send: async (row, payload) => {
          const appId = Deno.env.get("ONESIGNAL_APP_ID");
          const key = Deno.env.get("ONESIGNAL_REST_API_KEY");
          if (!appId || !key) throw new Error("push_not_configured");
          const res = await fetch("https://api.onesignal.com/notifications", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              Authorization: `Key ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              app_id: appId,
              idempotency_key: row.provider_key,
              include_aliases: { external_id: [row.recipient_id] },
              target_channel: "push",
              headings: { en: payload.title },
              contents: { en: payload.body },
              url: payload.url,
              data: {
                kind: "social",
                trip_id: row.trip_id,
                event_id: row.event_id,
              },
              collapse_id: row.provider_key,
            }),
          });
          return {
            status: res.status,
            body: await res.json().catch(() => null),
            retryAfter: res.headers.get("Retry-After"),
          };
        },
        finish: (row, status, providerId, error, retry) =>
          rpc("social_outbox_finish", {
            p_id: row.id,
            p_lease: row.lease_token,
            p_status: status,
            p_provider_id: providerId,
            p_error: error,
            p_retry_seconds: retry,
          }),
      });
    if (body.action === "worker") {
      if (
        !equal(
          req.headers.get("x-social-worker-secret") ?? "",
          Deno.env.get("SOCIAL_WORKER_SECRET") ?? "",
        )
      )
        return response({ error: "unauthorized" }, 401);
      return response(await work());
    }
    const b = validateCommand(body);
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user) return response({ error: "unauthorized" }, 401);
    if (b.action === "state")
      return response(
        await rpc("social_snapshot", { p_actor: user.id, p_trip: b.trip_id }),
      );
    if (b.action === "history")
      return response(
        await rpc("social_history", {
          p_actor: user.id,
          p_trip: b.trip_id,
          p_kind: b.kind,
          p_before: b.before ?? null,
          p_before_id: b.before_id ?? null,
        }),
      );
    if (b.action === "event")
      return response(
        await rpc("social_event", {
          p_actor: user.id,
          p_trip: b.trip_id,
          p_event: b.source_id,
        }),
      );
    const result = await rpc("social_command", {
      p_actor: user.id,
      p_trip: b.trip_id,
      p_action: b.action,
      p_key: b.key,
      p_source: b.source_id ?? null,
      p_target: b.target_id ?? null,
      p_text: b.text ?? null,
    });
    const runtime = (
      globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }
    ).EdgeRuntime;
    if (runtime)
      runtime.waitUntil(
        (async () => {
          await Promise.all([
            work(),
            ...(b.action === "shot_start"
              ? [
                  (async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10200));
                    await work();
                  })(),
                ]
              : []),
          ]);
        })().catch(() =>
          console.error("social background failed; durable queue retained"),
        ),
      );
    return response(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "request_failed";
    const known =
      /^(not_trip_member|trip_read_only|idempotency_required|idempotency_conflict|place_too_long|vibe_already_active|vibe_cooldown|not_owner|not_recipient|draw_active|daily_limit|no_participants|invalid_target|right_used|right_expired|invalid_response|not_winner|already_answered|invalid_action|bad_request|event_not_found)$/;
    return response(
      { error: known.test(message) ? message : "request_failed" },
      known.test(message) ? 409 : 500,
    );
  }
});
