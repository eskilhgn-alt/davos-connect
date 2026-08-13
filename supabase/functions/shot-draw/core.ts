/**
 * shot-draw core — runtime-uavhengig logikk for start / finalize / repair / sweep.
 *
 * Ingen Deno- eller Supabase-import her, slik at atferden kan testes direkte.
 * All autorisasjon og all trekning skjer server-side i RPC-ene; denne filen
 * orkestrerer kun kallene og den dedupliserte pushen.
 *
 * Viktige invarianter:
 *  - Mottakere hentes ALLTID fra trekningens snapshot (shot_draw_participants),
 *    aldri fra medlemslisten på sendetidspunktet.
 *  - Dispatch-claim er atomisk i DB med lease: kun én worker sender.
 *  - Provider kalles med en stabil provider_idempotency_key, slik at en retry
 *    etter «provider ok, mark_sent feilet» ikke gir dobbel varsling.
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

export type ClaimStatus = "claimed" | "already_sent" | "busy" | "retry";

export interface ClaimOutcome {
  status: ClaimStatus;
  /** Lease-token som må presenteres ved mark_sent / mark_failed. */
  leaseToken?: string | null;
  /** Stabil nøkkel mot pushprovider – uendret på tvers av retries. */
  providerIdempotencyKey?: string | null;
  attempts?: number;
}

export interface PushRequest {
  dedupeKey: string;
  providerIdempotencyKey: string;
  tripId: string;
  drawId: string;
  heading: string;
  content: string;
  recipients: string[];
}

export interface ShotDeps {
  /** RPC med innlogget brukers auth.uid() (RLS/medlemskap håndheves i DB). */
  callerRpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** RPC med service_role – kun for bakgrunnsjobben (sweep/waitUntil). */
  serviceRpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Mottakere = trekningens frosne snapshot, filtrert på leverbare pushaliaser. */
  snapshotRecipients(drawId: string): Promise<string[]>;
  displayName(userId: string): Promise<string>;
  /** Atomisk claim i DB (CAS + lease). Aldri destruktiv. */
  claimDispatch(
    dedupeKey: string,
    meta: { kind: string; sourceId: string; eventType: string },
  ): Promise<ClaimOutcome>;
  /** Returnerer false hvis leasen er tapt – da skal ingenting markeres sendt. */
  markDispatchSent(
    dedupeKey: string,
    leaseToken: string,
    recipientCount: number,
  ): Promise<boolean>;
  /** Registrerer feil uten å slette claim – raden forblir retrybar. */
  markDispatchFailed(dedupeKey: string, leaseToken: string, error: string): Promise<void>;
  sendPush(req: PushRequest): Promise<boolean>;
  now(): string;
  /** Kjør arbeid etter at svaret er sendt (EdgeRuntime.waitUntil). */
  background?(work: () => Promise<void>): void;
  /** Vent til gitt ISO-tidspunkt (serverklokke). */
  sleepUntil?(iso: string): Promise<void>;
  logError?(scope: string, err: unknown): void;
}

export interface ShotResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PushOutcome {
  sent: number;
  reason?: string;
}

/**
 * OneSignal svarer HTTP 200 også når ingen varsel ble opprettet
 * (typisk `errors: ["All included players are not subscribed"]`).
 * Aksepter derfor kun 2xx MED en faktisk meldings-ID, slik at en
 * ikke-levert push aldri markeres som sendt.
 */
export function isOneSignalAccepted(status: number, payload: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (!payload || typeof payload !== "object") return false;
  const body = payload as { id?: unknown; errors?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return false;
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length > 0) return false;
  if (errors && typeof errors === "object" && Object.keys(errors).length > 0) return false;
  return true;
}

function json(body: Record<string, unknown>, status = 200): ShotResult {
  return { status, body };
}

async function dispatchPush(
  deps: ShotDeps,
  args: {
    dedupeKey: string;
    eventType: "start" | "result";
    tripId: string;
    drawId: string;
    heading: string;
    content: string;
  },
): Promise<PushOutcome> {
  const claim = await deps.claimDispatch(args.dedupeKey, {
    kind: "shot",
    sourceId: args.drawId,
    eventType: args.eventType,
  });
  if (claim.status === "already_sent") return { sent: 0, reason: "already_dispatched" };
  if (claim.status === "busy") return { sent: 0, reason: "busy" };

  const leaseToken = claim.leaseToken ?? "";
  const providerKey = claim.providerIdempotencyKey ?? args.dedupeKey;
  if (!leaseToken) return { sent: 0, reason: "no_lease" };

  // Frosset snapshot: medlemsendringer etter start endrer aldri mottakersettet.
  const recipients = await deps.snapshotRecipients(args.drawId);
  if (recipients.length === 0) {
    await deps.markDispatchFailed(args.dedupeKey, leaseToken, "no_recipients");
    return { sent: 0, reason: "no_recipients" };
  }

  const ok = await deps.sendPush({
    dedupeKey: args.dedupeKey,
    providerIdempotencyKey: providerKey,
    tripId: args.tripId,
    drawId: args.drawId,
    heading: args.heading,
    content: args.content,
    recipients,
  });
  if (!ok) {
    await deps.markDispatchFailed(args.dedupeKey, leaseToken, "push_provider_error");
    return { sent: 0, reason: "push_provider_error" };
  }

  const marked = await deps.markDispatchSent(args.dedupeKey, leaseToken, recipients.length);
  if (!marked) {
    // Leasen er tapt: en annen worker eier raden. Vi markerer ingenting.
    return { sent: recipients.length, reason: "lease_lost" };
  }
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
 * Serverbakgrunn: vent til draw_at (serverklokke) og finaliser uten klient.
 * Feil logges, men skal aldri velte svaret som allerede er sendt.
 */
function scheduleServerFinalize(deps: ShotDeps, draw: ShotDrawRow): void {
  if (!deps.background || !deps.sleepUntil) return;
  const sleepUntil = deps.sleepUntil.bind(deps);
  deps.background(async () => {
    try {
      await sleepUntil(draw.draw_at);
      await finalizeAndAnnounce(deps, draw.id, "service");
    } catch (err) {
      deps.logError?.("shot_background_finalize", err);
    }
  });
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
      // Bakgrunnsfinalisering planlegges FØR og uavhengig av startpush:
      // en feilende eller treg push skal aldri hindre at trekningen fullføres.
      scheduleServerFinalize(deps, state.draw);
      try {
        await dispatchPush(deps, {
          dedupeKey: `shot:${state.draw.id}:start`,
          eventType: "start",
          tripId: state.draw.trip_id,
          drawId: state.draw.id,
          heading: "Shot-trekning",
          content: "Shot-trekning starter – 10 sekunder",
        });
      } catch (err) {
        deps.logError?.("shot_start_push", err);
      }
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
