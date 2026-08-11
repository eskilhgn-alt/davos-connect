/**
 * Atferdstester for Edge Function-kjernen (supabase/functions/shot-draw/core.ts).
 * Beviser at start/finalize/repair/sweep faktisk sender riktig push nøyaktig én
 * gang, at mottakerne kommer server-side, og at en trekning fullføres uten at
 * noen klient er åpen.
 */
import { describe, it, expect, vi } from "vitest";
import { handleShot, type ClaimResult, type ShotDeps } from "../../supabase/functions/shot-draw/core";

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

function makeDeps(overrides: Partial<ShotDeps> = {}) {
  const sent: { key: string; recipients: string[]; content: string }[] = [];
  const claimed = new Map<string, { sent: boolean; attempts: number; lastError?: string }>();

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
    eligibleRecipients: vi.fn(async () => ["u1", "u2", "u3"]),
    displayName: vi.fn(async () => "Kari"),
    claimDispatch: vi.fn(async (key): Promise<ClaimResult> => {
      const row = claimed.get(key);
      if (row?.sent) return "already_sent";
      if (row) {
        row.attempts += 1;
        return "retry";
      }
      claimed.set(key, { sent: false, attempts: 1 });
      return "claimed";
    }),
    markDispatchSent: vi.fn(async (key) => {
      claimed.set(key, { sent: true, attempts: claimed.get(key)?.attempts ?? 1 });
    }),
    markDispatchFailed: vi.fn(async (key, err) => {
      const row = claimed.get(key) ?? { sent: false, attempts: 1 };
      claimed.set(key, { ...row, lastError: err });
    }),
    sendPush: vi.fn(async (req) => {
      sent.push({ key: req.dedupeKey, recipients: req.recipients, content: req.content });
      return true;
    }),
    ...overrides,
  };
  return { deps, sent, claimed };
}

describe("shot-draw edge core – start", () => {
  it("oppretter draw og sender start-push til alle kvalifiserte", async () => {
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
});

describe("shot-draw edge core – dispatch er ikke-destruktiv", () => {
  it("registrerer feil uten å slette claim, og kan prøve på nytt", async () => {
    const { deps, claimed } = makeDeps({ sendPush: vi.fn(async () => false) });
    await handleShot({ action: "finalize", draw_id: DRAW }, deps);
    expect(deps.markDispatchFailed).toHaveBeenCalledWith(
      `shot:${DRAW}:result`,
      "push_provider_error",
    );
    expect(claimed.get(`shot:${DRAW}:result`)?.lastError).toBe("push_provider_error");

    // Nytt forsøk gjenbruker samme claim (retry), sender og markeres sendt.
    const ok = makeDeps();
    ok.claimed.set(`shot:${DRAW}:result`, { sent: false, attempts: 1 });
    await handleShot({ action: "finalize", draw_id: DRAW }, ok.deps);
    expect(ok.sent).toHaveLength(1);
    expect(ok.claimed.get(`shot:${DRAW}:result`)?.sent).toBe(true);
  });

  it("uten mottakere sendes ingen push, men claim beholdes", async () => {
    const { deps, sent } = makeDeps({ eligibleRecipients: vi.fn(async () => []) });
    await handleShot({ action: "start", trip_id: TRIP, idempotency_key: "key-12345678" }, deps);
    expect(sent).toHaveLength(0);
    expect(deps.markDispatchFailed).toHaveBeenCalledWith(`shot:${DRAW}:start`, "no_recipients");
  });
});
