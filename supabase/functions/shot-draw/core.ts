/**
 * shot-draw core — runtime-uavhengig logikk for start / finalize / repair / sweep.
 *
 * Ingen Deno- eller Supabase-import her, slik at atferden kan testes direkte.
 * All autorisasjon og all trekning skjer server-side i RPC-ene; denne filen
 * orkestrerer kun kallene og den dedupliserte pushen.
 */

export interface ShotDrawRow {
  id: string;
  trip_id: string;
  initiated_by: string;
  status: "countdown" | "finalized";
  draw_at: string;
  finalized_at: string | null;
  participant_count: number;
  winner_id: string | null;
}

export interface ShotStateResponse {
  server_now: string;
  draw: ShotDrawRow | null;
  participants: { user_id: string; position: number }[];
}

export type ClaimResult = "claimed" | "already_sent" | "retry";

export interface PushRequest {
  dedupeKey: string;
  tripId: string;
  drawId: string;
  heading: string;
  content: string;
  recipients: string[];
}

export interface ShotDeps {
  /** RPC med innlogget brukers auth.uid() (RLS/medlemskap håndheves i DB). */
  callerRpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** RPC med service_role – kun for bakgrunnsjobben (sweep). */
  serviceRpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Kvalifiserte mottakere: nøyaktig samme sett som trekningens snapshot. */
  eligibleRecipients(tripId: string): Promise<string[]>;
  displayName(userId: string): Promise<string>;
  /** Atomisk, ikke-destruktiv claim i notification_dispatches. */
  claimDispatch(
    dedupeKey: string,
    meta: { kind: string; sourceId: string; eventType: string },
  ): Promise<ClaimResult>;
  markDispatchSent(dedupeKey: string, recipientCount: number): Promise<void>;
  /** Registrerer feil uten å slette claim – raden forblir retrybar. */
  markDispatchFailed(dedupeKey: string, error: string): Promise<void>;
  sendPush(req: PushRequest): Promise<boolean>;
  now(): string;
}

export interface ShotResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PushOutcome {
  sent: number;
  reason?: string;
}

function json(body: Record<string, unknown>, status = 200): ShotResult {
  return { status, body };
}

async function dispatchPush(
  deps: ShotDeps,
  args: { dedupeKey: string; eventType: "start" | "result"; tripId: string; drawId: string; heading: string; content: string },
): Promise<PushOutcome> {
  const claim = await deps.claimDispatch(args.dedupeKey, {
    kind: "shot",
    sourceId: args.drawId,
    eventType: args.eventType,
  });
  if (claim === "already_sent") return { sent: 0, reason: "already_dispatched" };

  const recipients = await deps.eligibleRecipients(args.tripId);
  if (recipients.length === 0) {
    await deps.markDispatchFailed(args.dedupeKey, "no_recipients");
    return { sent: 0, reason: "no_recipients" };
  }

  const ok = await deps.sendPush({
    dedupeKey: args.dedupeKey,
    tripId: args.tripId,
    drawId: args.drawId,
    heading: args.heading,
    content: args.content,
    recipients,
  });
  if (!ok) {
    await deps.markDispatchFailed(args.dedupeKey, "push_provider_error");
    return { sent: 0, reason: "push_provider_error" };
  }
  await deps.markDispatchSent(args.dedupeKey, recipients.length);
  return { sent: recipients.length };
}

async function finalizeAndAnnounce(
  deps: ShotDeps,
  drawId: string,
  mode: "caller" | "service",
): Promise<ShotStateResponse> {
  const state = (await (mode === "service"
    ? deps.serviceRpc("rpc_shot_finalize_service", { p_draw_id: drawId })
    : deps.callerRpc("rpc_shot_finalize", { p_draw_id: drawId }))) as ShotStateResponse;
  const draw = state?.draw;
  if (draw?.status === "finalized" && draw.winner_id) {
    const name = await deps.displayName(draw.winner_id);
    await dispatchPush(deps, {
      dedupeKey: `shot:${draw.id}:result`,
      eventType: "result",
      tripId: draw.trip_id,
      drawId: draw.id,
      heading: "Shot-trekning",
      content: `${name} fikk shot`,
    });
  }
  return state;
}

/**
 * Håndterer én forespørsel. `isService` er kun sant for den interne
 * bakgrunnsjobben (sweep) som autentiseres med delt hemmelighet.
 */
export async function handleShot(
  body: Record<string, unknown>,
  deps: ShotDeps,
  opts: { isService?: boolean } = {},
): Promise<ShotResult> {
  const action = String(body.action ?? "");
  const tripId = typeof body.trip_id === "string" ? body.trip_id : null;

  if (action === "sweep") {
    if (!opts.isService) return json({ error: "unauthorized" }, 401);
    const due = ((await deps.serviceRpc("rpc_shot_due_draws_all", {})) ?? []) as
      | string[]
      | { id: string }[];
    const ids = (due as unknown[]).map((d) =>
      typeof d === "string" ? d : (d as { id: string }).id,
    );
    for (const id of ids) await finalizeAndAnnounce(deps, id, "service");
    return json({ server_now: deps.now(), finalized: ids.length });
  }

  if (action === "state") {
    if (!tripId) return json({ error: "trip_required" }, 400);
    return json(
      (await deps.callerRpc("rpc_shot_current", { p_trip_id: tripId })) as unknown as Record<
        string,
        unknown
      >,
    );
  }

  if (action === "start") {
    const key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
    if (!tripId || !key) return json({ error: "bad_request" }, 400);
    const state = (await deps.callerRpc("rpc_shot_start", {
      p_trip_id: tripId,
      p_idempotency_key: key,
    })) as ShotStateResponse;
    if (state?.draw && state.draw.status === "countdown") {
      await dispatchPush(deps, {
        dedupeKey: `shot:${state.draw.id}:start`,
        eventType: "start",
        tripId: state.draw.trip_id,
        drawId: state.draw.id,
        heading: "Shot-trekning",
        content: "Shot-trekning starter – 10 sekunder",
      });
    }
    return json(state as unknown as Record<string, unknown>);
  }

  if (action === "finalize") {
    const drawId = typeof body.draw_id === "string" ? body.draw_id : null;
    if (!drawId) return json({ error: "bad_request" }, 400);
    return json(
      (await finalizeAndAnnounce(deps, drawId, "caller")) as unknown as Record<string, unknown>,
    );
  }

  if (action === "repair") {
    if (!tripId) return json({ error: "trip_required" }, 400);
    const due = ((await deps.callerRpc("rpc_shot_due_draws", { p_trip_id: tripId })) ?? []) as
      | string[]
      | { id: string }[];
    const ids = (due as unknown[]).map((d) =>
      typeof d === "string" ? d : (d as { id: string }).id,
    );
    for (const id of ids) await finalizeAndAnnounce(deps, id, "caller");
    return json(
      (await deps.callerRpc("rpc_shot_current", { p_trip_id: tripId })) as unknown as Record<
        string,
        unknown
      >,
    );
  }

  return json({ error: "unknown_action" }, 400);
}
