/**
 * Port 0 + de fire Shot-funnene: atferds- og kontraktstester.
 *
 * De ekte database-atferdstestene kjøres mot en isolert Postgres via
 * `bash supabase/tests/port0/run.sh` (se docs/PORT0_RUNBOOK.md). Her dekkes
 * klientkontrakten, Edge-orkestreringen og de invariantene i pending SQL som
 * ikke kan uttrykkes uten en database.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isForSelectedTrip } from "@/features/trip/tripSync";
import {
  handleShot,
  isOneSignalAccepted,
  type ShotDeps,
  type ShotStateResponse,
} from "../../supabase/functions/shot-draw/core";

const readPending = (f: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations-pending", f), "utf8");

const port0 = readPending("20260813_port0_trip_model_authz.sql");
const shotSql = readPending("20260810_shot_draws.sql");
const sweepSql = readPending("20260811_shot_background_sweep.sql");

describe("Port 0 — eksplisitt turkontekst på klienten", () => {
  it("avviser sent svar for en annen tur", () => {
    expect(isForSelectedTrip("trip-a", "trip-b")).toBe(false);
  });
  it("aksepterer svar for valgt tur", () => {
    expect(isForSelectedTrip("trip-a", "trip-a")).toBe(true);
  });
  it("aksepterer nøytral nyttelast uten trip_id når en tur er valgt", () => {
    expect(isForSelectedTrip("trip-a", null)).toBe(true);
  });
  it("avviser alt når ingen tur er valgt", () => {
    expect(isForSelectedTrip(null, "trip-a")).toBe(false);
    expect(isForSelectedTrip(null, null)).toBe(false);
  });
});

describe("Port 0 — pending migrasjon er additiv og ikke destruktiv", () => {
  it("inneholder ingen DROP/DELETE/TRUNCATE-setninger", () => {
    const destructive = port0
      .split("\n")
      .filter((l) => /^\s*(DROP|DELETE\s+FROM|TRUNCATE)\b/i.test(l));
    expect(destructive).toEqual([]);
  });
  it("beholder nullable turdatoer (ingen oppdiktede defaults)", () => {
    expect(port0).not.toMatch(/start_date[^\n]*(SET\s+DEFAULT|SET\s+NOT\s+NULL)/i);
    expect(port0).not.toMatch(/end_date[^\n]*(SET\s+DEFAULT|SET\s+NOT\s+NULL)/i);
    expect(port0).not.toMatch(/2027-\d\d-\d\d/);
  });
  it("pinner tom search_path på alle SECURITY DEFINER-funksjoner", () => {
    const defs = port0.match(/SECURITY DEFINER[\s\S]{0,80}?SET search_path = ''/g) ?? [];
    const secdef = port0.match(/SECURITY DEFINER/g) ?? [];
    expect(defs.length).toBe(secdef.length);
  });
  it("fjerner PUBLIC/anon EXECUTE og gir kun eksplisitte grants", () => {
    expect(port0).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon/);
    expect(port0).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role/);
    expect(port0).not.toMatch(/GRANT EXECUTE[^\n]*TO anon/);
  });
  it("legger arkivgrensen som RESTRICTIVE backstop", () => {
    expect(port0).toMatch(/AS RESTRICTIVE FOR INSERT/);
    expect(port0).toMatch(/public\.is_trip_writable\(trip_id\)/);
  });
  it("legger realtime-tabeller idempotent", () => {
    expect(port0).toMatch(/IF NOT EXISTS \(\s*\n?\s*SELECT 1 FROM pg_publication_tables/);
  });
  it("inneholder ingen literale nøkler eller hemmeligheter", () => {
    expect(port0).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(port0).not.toMatch(/service_role_key|anon_key/i);
  });
});

describe("Shot-funn 1 — bakgrunnsfinalisering planlegges før og uavhengig av startpush", () => {
  function deps(overrides: Partial<ShotDeps> = {}) {
    const order: string[] = [];
    const state: ShotStateResponse = {
      server_now: "2026-08-13T06:00:00.000Z",
      draw: {
        id: "d1",
        trip_id: "t1",
        initiated_by: "u1",
        status: "countdown",
        draw_at: "2026-08-13T06:00:10.000Z",
        finalized_at: null,
        participant_count: 3,
        winner_id: null,
      },
      participants: [],
    };
    const base: ShotDeps = {
      callerRpc: async (name) => (name === "rpc_shot_start" ? state : {}),
      serviceRpc: async () => ({}),
      snapshotRecipients: async () => ["u1"],
      displayName: async () => "Ola",
      claimDispatch: async () => {
        order.push("claim");
        return { status: "claimed", leaseToken: "L", providerIdempotencyKey: "P" };
      },
      markDispatchSent: async () => true,
      markDispatchFailed: async () => {},
      sendPush: async () => true,
      now: () => "2026-08-13T06:00:00.000Z",
      background: (work) => {
        order.push("background_scheduled");
        void work();
      },
      sleepUntil: async () => {},
      logError: () => {},
      ...overrides,
    };
    return { deps: base, order };
  }

  it("planlegger waitUntil-finalisering FØR startpush forsøkes", async () => {
    const { deps: d, order } = deps();
    await handleShot({ action: "start", trip_id: "t1", idempotency_key: "k" }, d);
    expect(order[0]).toBe("background_scheduled");
    expect(order).toContain("claim");
  });

  it("fullfører trekningen selv om startpush kaster", async () => {
    const finalized: string[] = [];
    const { deps: d } = deps({
      claimDispatch: async () => {
        throw new Error("push infra down");
      },
      serviceRpc: async (name, args) => {
        if (name === "rpc_shot_finalize_service") {
          finalized.push(String((args as { p_draw_id: string }).p_draw_id));
          return { server_now: "x", draw: null, participants: [] };
        }
        return {};
      },
    });
    const res = await handleShot({ action: "start", trip_id: "t1", idempotency_key: "k" }, d);
    expect(res.status).toBe(200);
    expect(finalized).toEqual(["d1"]);
  });
});

describe("Shot-funn 2 — mark_sent/mark_failed krever ikke-null lease-token", () => {
  it("SQL krever eksplisitt p_lease_token IS NOT NULL og likhet", () => {
    const guards = shotSql.match(/AND p_lease_token IS NOT NULL\s*\n\s*AND lease_token = p_lease_token;/g) ?? [];
    expect(guards.length).toBe(2);
    expect(shotSql).not.toMatch(/lease_token IS NOT DISTINCT FROM p_lease_token/);
  });
  it("core sender ingenting uten lease-token", async () => {
    const sendPush = vi.fn(async () => true);
    const d: ShotDeps = {
      callerRpc: async () => ({
        server_now: "n",
        draw: {
          id: "d1",
          trip_id: "t1",
          initiated_by: "u",
          status: "countdown",
          draw_at: "2026-08-13T06:00:10.000Z",
          finalized_at: null,
          participant_count: 2,
          winner_id: null,
        },
        participants: [],
      }),
      serviceRpc: async () => ({}),
      snapshotRecipients: async () => ["u1"],
      displayName: async () => "Ola",
      claimDispatch: async () => ({ status: "claimed", leaseToken: null, providerIdempotencyKey: "P" }),
      markDispatchSent: async () => true,
      markDispatchFailed: async () => {},
      sendPush,
      now: () => "n",
    };
    await handleShot({ action: "start", trip_id: "t1", idempotency_key: "k" }, d);
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe("Shot-funn 3 — cron oppdateres idempotent uten unschedule", () => {
  it("bruker cron.alter_job i stedet for unschedule/recreate", () => {
    expect(sweepSql).toMatch(/cron\.alter_job/);
    expect(sweepSql).not.toMatch(/cron\.unschedule/);
  });
  it("beholder samme jobbnavn og 10-sekunders schedule", () => {
    expect(sweepSql).toMatch(/'shot-draw-sweep'/);
    expect(sweepSql).toMatch(/'10 seconds'/);
  });
  it("henter hemmeligheter fra Vault, ikke literaler", () => {
    expect(sweepSql).toMatch(/vault\.decrypted_secrets/);
    expect(sweepSql).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe("Shot-funn 4 — OneSignal 200 godtas kun med faktisk meldings-ID", () => {
  it("avviser 200 uten id", () => {
    expect(isOneSignalAccepted(200, { recipients: 0 })).toBe(false);
  });
  it("avviser 200 med feilliste", () => {
    expect(
      isOneSignalAccepted(200, {
        id: "",
        errors: ["All included players are not subscribed"],
      }),
    ).toBe(false);
    expect(isOneSignalAccepted(200, { id: "abc", errors: ["boom"] })).toBe(false);
  });
  it("aksepterer 200 med id", () => {
    expect(isOneSignalAccepted(200, { id: "abc-123" })).toBe(true);
  });
  it("avviser ikke-2xx og ugyldig body", () => {
    expect(isOneSignalAccepted(400, { id: "abc" })).toBe(false);
    expect(isOneSignalAccepted(200, null)).toBe(false);
  });
  it("markerer ikke sendt når provider ikke aksepterte", async () => {
    const markSent = vi.fn(async () => true);
    const markFailed = vi.fn(async () => {});
    const d: ShotDeps = {
      callerRpc: async () => ({
        server_now: "n",
        draw: {
          id: "d1",
          trip_id: "t1",
          initiated_by: "u",
          status: "countdown",
          draw_at: "2026-08-13T06:00:10.000Z",
          finalized_at: null,
          participant_count: 2,
          winner_id: null,
        },
        participants: [],
      }),
      serviceRpc: async () => ({}),
      snapshotRecipients: async () => ["u1"],
      displayName: async () => "Ola",
      claimDispatch: async () => ({ status: "claimed", leaseToken: "L", providerIdempotencyKey: "P" }),
      markDispatchSent: markSent,
      markDispatchFailed: markFailed,
      sendPush: async () => false,
      now: () => "n",
    };
    await handleShot({ action: "start", trip_id: "t1", idempotency_key: "k" }, d);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith("shot:d1:start", "L", "push_provider_error");
  });
});
