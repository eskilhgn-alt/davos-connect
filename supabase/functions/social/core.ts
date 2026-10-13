/** Runtime-independent worker. No fake delivery receipts and no live test push. */
export interface Delivery {
  id: string;
  trip_id: string;
  recipient_id: string;
  event_id: string;
  provider_key: string;
  lease_token: string;
  attempts: number;
}
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  event_id: string;
  trip_id: string;
}
export interface WorkerDeps {
  tick(): Promise<unknown>;
  claim(): Promise<Delivery[]>;
  payload(row: Delivery): Promise<PushPayload | null>;
  send(
    row: Delivery,
    payload: PushPayload,
  ): Promise<{ status: number; body: unknown; retryAfter?: string | null }>;
  finish(
    row: Delivery,
    status: string,
    providerId: string | null,
    error: string | null,
    retrySeconds: number,
  ): Promise<boolean>;
}
export function retrySeconds(
  header: string | null | undefined,
  attempts: number,
  now = Date.now(),
): number {
  const fallback = Math.min(3600, 15 * 2 ** Math.min(attempts, 8));
  const numeric = header == null ? NaN : Number(header);
  const parsed = header == null ? NaN : Date.parse(header);
  const value = Number.isFinite(numeric)
    ? numeric
    : Number.isFinite(parsed)
      ? Math.ceil((parsed - now) / 1000)
      : fallback;
  return Math.max(1, Math.min(86400, value));
}
export function providerId(status: number, body: unknown): string | null {
  if (status < 200 || status >= 300 || !body || typeof body !== "object")
    return null;
  const value = body as { id?: unknown; errors?: unknown };
  // A provider ID proves acceptance only, never receipt on a physical phone.
  const errors = value.errors;
  if (errors && (typeof errors !== "object" || Object.keys(errors).length > 0))
    return null;
  return typeof value.id === "string" && value.id.trim() ? value.id : null;
}
export async function runWorker(deps: WorkerDeps) {
  await deps.tick();
  const rows = await deps.claim();
  let accepted = 0;
  for (const row of rows) {
    try {
      const payload = await deps.payload(row);
      if (!payload) {
        await deps.finish(
          row,
          "suppressed",
          null,
          "recipient_or_trip_ineligible",
          1,
        );
        continue;
      }
      const response = await deps.send(row, payload);
      const id = providerId(response.status, response.body);
      if (id) {
        if (await deps.finish(row, "accepted", id, null, 1)) accepted++;
      } else {
        const retryable = response.status === 429 || response.status >= 500;
        await deps.finish(
          row,
          retryable ? "pending" : "failed",
          null,
          `provider_${response.status}`,
          retrySeconds(response.retryAfter, row.attempts),
        );
      }
    } catch {
      // Includes timeout or lost DB acknowledgement after provider accepted.
      // The next lease uses exactly the same provider_key and immutable body.
      await deps
        .finish(
          row,
          "pending",
          null,
          "transport_or_ack_error",
          retrySeconds(null, row.attempts),
        )
        .catch(() => false);
    }
  }
  return { claimed: rows.length, accepted };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set([
  "state",
  "history",
  "event",
  "vibe_start",
  "vibe_end",
  "shot_start",
  "headshot",
  "respond",
  "read",
  "dismiss",
]);
export function validateCommand(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("bad_request");
  const b = body as Record<string, unknown>;
  if (!actions.has(String(b.action)) || !uuid.test(String(b.trip_id)))
    throw new Error("bad_request");
  if (
    !["state", "history", "event"].includes(String(b.action)) &&
    !uuid.test(String(b.key))
  )
    throw new Error("idempotency_required");
  for (const key of ["source_id", "target_id"])
    if (b[key] != null && !uuid.test(String(b[key])))
      throw new Error("bad_request");
  if (b.text != null && (typeof b.text !== "string" || b.text.length > 160))
    throw new Error("bad_request");
  if (b.action === "event" && !uuid.test(String(b.source_id)))
    throw new Error("bad_request");
  if (b.action === "history") {
    if (!["vibe", "draws", "notifications"].includes(String(b.kind)))
      throw new Error("bad_request");
    if ((b.before == null) !== (b.before_id == null))
      throw new Error("bad_request");
    if (
      b.before != null &&
      (typeof b.before !== "string" ||
        !Number.isFinite(Date.parse(b.before)) ||
        !uuid.test(String(b.before_id)))
    )
      throw new Error("bad_request");
  }
  return b;
}
