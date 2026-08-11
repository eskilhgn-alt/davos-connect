/**
 * Atferdstest for klientflyten: start og finalisering må gå gjennom Edge
 * Function `shot-draw`, aldri direkte på mutasjons-RPC-ene.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { shotApi, newIdempotencyKey } from "@/features/shot/api";

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  invoke.mockResolvedValue({ data: { server_now: "x", draw: null, participants: [] }, error: null });
});

describe("shot klient-API", () => {
  it("start treffer Edge action:start med trip_id og idempotensnøkkel", async () => {
    await shotApi.start("trip-1", "key-12345678");
    expect(invoke).toHaveBeenCalledWith("shot-draw", {
      body: { action: "start", trip_id: "trip-1", idempotency_key: "key-12345678" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("finalize treffer Edge action:finalize", async () => {
    await shotApi.finalize("draw-1");
    expect(invoke).toHaveBeenCalledWith("shot-draw", {
      body: { action: "finalize", draw_id: "draw-1" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("repair treffer Edge action:repair for valgt tur", async () => {
    await shotApi.repair("trip-2");
    expect(invoke).toHaveBeenCalledWith("shot-draw", {
      body: { action: "repair", trip_id: "trip-2" },
    });
  });

  it("kaster ved serverfeil", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("not_trip_member") });
    await expect(shotApi.start("trip-1")).rejects.toThrow("not_trip_member");
  });

  it("idempotensnøkkel er unik og kryptografisk", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});

describe("useShotDraw kildekontrakt", () => {
  it("kaller aldri mutasjons-RPC direkte", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/hooks/useShotDraw.ts", "utf8"),
    );
    expect(src).not.toMatch(/rpc\("rpc_shot_start"/);
    expect(src).not.toMatch(/rpc\("rpc_shot_finalize"/);
    expect(src).toMatch(/shotApi\.start\(/);
    expect(src).toMatch(/shotApi\.finalize\(/);
    expect(src).toMatch(/shotApi\.repair\(/);
  });
});
