/**
 * Atferdstester for Edge Function-kjernen (supabase/functions/shot-draw/core.ts).
 *
 * Beviser at:
 *  - mottakere kommer fra trekningens snapshot, ikke fra medlemslisten nå,
 *  - start/resultat-push sendes nøyaktig én gang,
 *  - parallelle claim-forsøk gir kun én sender (busy),
 *  - stale lease kan overtas, providerfeil og mark_sent-feil er retrybare,
 *  - retry bruker samme provider_idempotency_key,
 *  - en trekning fullføres uten at noen klient er åpen.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleShot,
  type ClaimOutcome,
  type ShotDeps,
} from "../../supabase/functions/shot-draw/core";

const TRIP = "trip-1";
const DRAW = "draw-1";

function stateFor(status: "countdown" | "finalized", winner: string | null = null) {
  return {
    server_now: "2026-08-11T10:00:00.000Z",
    draw: {
      id: DRAW,
      trip_id: TRIP,
      initiated_by: "u1",
      status,
      draw_at: "2026-08-11T10:00:10.000Z",
      finalized_at: status === "finalized" ? "2026-08-11T10:00:10.000Z" : null,
      participant_count: 3,
      winner_id: winner,
    },
    participants: [],
  };
}

interface Row {
  sent: boolean;
  attempts: number;
  lease: string | null;
  leaseExpiresAt: number;
  providerKey: string;
  lastError?: string;
}

/** Minimal in-memory-modell av den atomiske claim-RPC-en (CAS + lease). */
function makeStore(nowMs = 0) {
  const rows = new Map<string, Row>();
  const clock = { now: nowMs };
  let leaseSeq = 0;
  const LEASE_MS = 30_000;

  const claim = (key: string): ClaimOutcome => {
    const row = rows.get(key);
    if (row?.sent) return { status: "already_sent", attempts: row.attempts };
    if (row && row.lease && row.leaseExpiresAt > clock.now) {
      return { status: "busy", attempts: row.attempts };
    }
    const lease = `lease-${++leaseSeq}`;
    if (!row) {
      const fresh: Row = {
        sent: false,
        attempts: 1,
        lease,
        leaseExpiresAt: clock.now + LEASE_MS,
        providerKey: `pk-${key}`,
      };
      rows.set(key, fresh);
      return { status: "claimed", leaseToken: lease, providerIdempotencyKey: fresh.providerKey, attempts: 1 };
    }
    row.attempts += 1;
    row.lease = lease;
    row.leaseExpiresAt = clock.now + LEASE_MS;
    return {
      status: "retry",
      leaseToken: lease,
      providerIdempotencyKey: row.providerKey,
      attempts: row.attempts,
    };
  };

  const markSent = (key: string, lease: string) => {
    const row = rows.get(key);
    if (!row || row.sent || row.lease !== lease) return false;
    row.sent = true;
    row.lease = null;
    return true;
  };

  const markFailed = (key: string, lease: string, err: string) => {
    const row = rows.get(key);
    if (!row || row.lease !== lease) return;
    row.lastError = err;
    row.lease = null;
    row.leaseExpiresAt = 0;
  };

  return { rows, clock, claim, markSent, markFailed, LEASE_MS };
}

function makeDeps(overrides: Partial<ShotDeps> = {}, store = makeStore()) {
  const sent: {
    key: string;
    providerKey: string;
    recipients: string[];
    content: string;
  }[] = [];

  const deps: ShotDeps = {
    now: () => "2026-08-11T10:00:00.000Z",
    callerRpc: vi.fn(async (name: string) => {
      if (name === "rpc_shot_start") return stateFor("countdown");
      if (name === "rpc_shot_finalize") return stateFor("finalized", "u2");
      if (name === "rpc_shot_current") return stateFor("finalized", "u2");
      if (name === "rpc_shot_due_draws") return [DRAW];
      return null;
    }),
    serviceRpc: vi.fn(async (name: string) => {
      if (name === "rpc_shot_due_draws_all") return [DRAW];
      if (name === "rpc_shot_finalize_service") return stateFor("finalized", "u2");
      return null;
    }),
    snapshotRecipients: vi.fn(async () => ["u1", "u2", "u3"]),
    displayName: vi.fn(async () => "Kari"),
    claimDispatch: vi.fn(async (key: string) => store.claim(key)),
    markDispatchSent: vi.fn(async (key: string, lease: string) => store.markSent(key, lease)),
    markDispatchFailed: vi.fn(async (key: string, lease: string, err: string) => {
      store.markFailed(key, lease, err);
    }),
    sendPush: vi.fn(async (req) => {
      sent.push({
        key: req.dedupeKey,
        providerKey: req.providerIdempotencyKey,
        recipients: req.recipients,
        content: req.content,
      });
      return true;
    }),
    ...overrides,
  };
  return { deps, sent, store };
}

describe("shot-draw edge core – start", () => {
  it("oppretter draw og sender start-push til snapshotmottakerne", async () => {
    const { deps, sent } = makeDeps();
    const res = await handleShot(
      { action: "start", trip_id: TRIP, idempotency_key: "key-12345678" },
      deps,
    );
    expect(res.status).toBe(200);
    expect(deps.callerRpc).toHaveBeenCalledWith("rpc_shot_start", {
      p_trip_id: TRIP,
      p_idempotency_key: "key-12345678",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].key).toBe(`shot:${DRAW}:start`);
    expect(sent[0].content).toContain("10 sekunder");
    expect(sent[0].recipients).toEqual(["u1", "u2", "u3"]);
    // Mottakerne slås opp per draw_id, ikke per trip_id.
    expect(deps.snapshotRecipients).toHaveBeenCalledWith(DRAW);
  });

  it("sender start-push kun én gang ved dobbeltstart", async () => {
    const { deps, sent } = makeDeps();
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    expect(sent).toHaveLength(1);
  });

  it("krever trip_id og idempotensnøkkel", async () => {
    const { deps } = makeDeps();
    expect((await handleShot({ action: "start" }, deps)).status).toBe(400);
  });
});

describe("shot-draw edge core – snapshot av mottakere", () => {
  it("medlemsendring etter start endrer ikke mottakersettet", async () => {
    const snapshot = ["u1", "u2", "u3"];
    // Medlemslisten «endres» underveis, men snapshotet er frosset per draw.
    const { deps, sent } = makeDeps({
      snapshotRecipients: vi.fn(async (drawId: string) =>
        drawId === DRAW ? snapshot.slice() : ["fremmed"],
      ),
    });
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    expect(sent.map((s) => s.recipients)).toEqual([
      ["u1", "u2", "u3"],
      ["u1", "u2", "u3"],
    ]);
  });

  it("annen trekning gir aldri denne trekningens mottakere", async () => {
    const bydraw: Record<string, string[]> = { [DRAW]: ["u1"], "draw-2": ["x1", "x2"] };
    const { deps, sent } = makeDeps({
      snapshotRecipients: vi.fn(async (id: string) => bydraw[id] ?? []),
    });
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    expect(sent[0].recipients).toEqual(["u1"]);
  });
});

describe("shot-draw edge core – finalize/repair", () => {
  it("finalize sender resultat-push med vinnernavn én gang", async () => {
    const { deps, sent } = makeDeps();
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    expect(deps.callerRpc).toHaveBeenCalledWith("rpc_shot_finalize", { p_draw_id: DRAW });
    expect(sent.filter((s) => s.key === `shot:${DRAW}:result`)).toHaveLength(1);
    expect(sent[0].content).toBe("Kari fikk shot");
  });

  it("repair finaliserer forfalte trekninger for turen", async () => {
    const { deps, sent } = makeDeps();
    const res = await handleShot({ action: "repair", trip_id: TRIP }, deps);
    expect(res.status).toBe(200);
    expect(deps.callerRpc).toHaveBeenCalledWith("rpc_shot_due_draws", { p_trip_id: TRIP });
    expect(sent.map((s) => s.key)).toEqual([`shot:${DRAW}:result`]);
  });
});

describe("shot-draw edge core – bakgrunn uten åpen klient", () => {
  it("sweep finaliserer og varsler via service-role", async () => {
    const { deps, sent } = makeDeps();
    const res = await handleShot({ action: "sweep" }, deps, { isService: true });
    expect(res.status).toBe(200);
    expect(deps.serviceRpc).toHaveBeenCalledWith("rpc_shot_due_draws_all", {});
    expect(deps.serviceRpc).toHaveBeenCalledWith("rpc_shot_finalize_service", {
      p_draw_id: DRAW,
    });
    expect(deps.callerRpc).not.toHaveBeenCalled();
    expect(sent.map((s) => s.key)).toEqual([`shot:${DRAW}:result`]);
  });

  it("sweep uten servernøkkel avvises", async () => {
    const { deps } = makeDeps();
    const res = await handleShot({ action: "sweep" }, deps);
    expect(res.status).toBe(401);
    expect(deps.serviceRpc).not.toHaveBeenCalled();
  });

  it("start planlegger serverfinalisering ved draw_at uten klient", async () => {
    const jobs: (() => Promise<void>)[] = [];
    const slept: string[] = [];
    const { deps, sent } = makeDeps({
      background: (work) => {
        jobs.push(work);
      },
      sleepUntil: async (iso: string) => {
        slept.push(iso);
      },
    });
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    expect(jobs).toHaveLength(1);
    await jobs[0]();
    expect(slept).toEqual(["2026-08-11T10:00:10.000Z"]);
    expect(deps.serviceRpc).toHaveBeenCalledWith("rpc_shot_finalize_service", {
      p_draw_id: DRAW,
    });
    expect(sent.map((s) => s.key)).toEqual([`shot:${DRAW}:start`, `shot:${DRAW}:result`]);
  });

  it("feil i bakgrunnsjobben logges og velter ikke svaret", async () => {
    const jobs: (() => Promise<void>)[] = [];
    const logError = vi.fn();
    const { deps } = makeDeps({
      background: (work) => {
        jobs.push(work);
      },
      sleepUntil: async () => {
        throw new Error("boom");
      },
      logError,
    });
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    await expect(jobs[0]()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith("shot_background_finalize", expect.any(Error));
  });
});

describe("shot-draw edge core – atomisk dispatch-claim", () => {
  it("parallelle forsøk gir kun én sender (aktiv lease = busy)", async () => {
    const store = makeStore();
    const a = makeDeps({}, store);
    const b = makeDeps({}, store);
    const [, ] = await Promise.all([
      handleShot({ action: "finalize", draw_id: DRAW }, a.deps),
      handleShot({ action: "finalize", draw_id: DRAW }, b.deps),
    ]);
    expect(a.sent.length + b.sent.length).toBe(1);
  });

  it("stale lease kan overtas, og retry bruker samme provider-idempotency-key", async () => {
    const store = makeStore();
    const first = makeDeps({ sendPush: vi.fn(async () => false) }, store);
    await handleShot({ action: "finalize", draw_id: DRAW }, first.deps);
    expect(store.rows.get(`shot:${DRAW}:result`)?.lastError).toBe("push_provider_error");
    expect(store.rows.get(`shot:${DRAW}:result`)?.sent).toBe(false);

    store.clock.now += store.LEASE_MS + 1; // leasen er utløpt
    const second = makeDeps({}, store);
    await handleShot({ action: "finalize", draw_id: DRAW }, second.deps);
    expect(second.sent).toHaveLength(1);
    expect(second.sent[0].providerKey).toBe(`pk-shot:${DRAW}:result`);
    expect(store.rows.get(`shot:${DRAW}:result`)?.sent).toBe(true);
    expect(store.rows.get(`shot:${DRAW}:result`)?.attempts).toBe(2);
  });

  it("providerfeil markerer ikke sendt", async () => {
    const store = makeStore();
    const { deps } = makeDeps({ sendPush: vi.fn(async () => false) }, store);
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    expect(deps.markDispatchSent).not.toHaveBeenCalled();
    expect(store.rows.get(`shot:${DRAW}:result`)?.sent).toBe(false);
  });

  it("mark_sent-feil (tapt lease) gir retry med samme provider-nøkkel og ikke dobbel varsling", async () => {
    const store = makeStore();
    const lost = makeDeps({ markDispatchSent: vi.fn(async () => false) }, store);
    const out = await handleShot({ action: "finalize", draw_id: DRAW }, lost.deps);
    expect(out.status).toBe(200);
    expect(store.rows.get(`shot:${DRAW}:result`)?.sent).toBe(false);

    store.clock.now += store.LEASE_MS + 1;
    const retry = makeDeps({}, store);
    await handleShot({ action: "finalize", draw_id: DRAW }, retry.deps);
    // Samme provider-idempotency-key => provideren dedupliserer selv.
    expect(retry.sent[0].providerKey).toBe(lost.sent[0].providerKey);
  });

  it("uten mottakere sendes ingen push, men claim beholdes", async () => {
    const store = makeStore();
    const { deps, sent } = makeDeps({ snapshotRecipients: vi.fn(async () => []) }, store);
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    expect(sent).toHaveLength(0);
    expect(store.rows.get(`shot:${DRAW}:start`)?.lastError).toBe("no_recipients");
    expect(store.rows.get(`shot:${DRAW}:start`)?.sent).toBe(false);
  });
});
