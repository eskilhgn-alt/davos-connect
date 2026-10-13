import { describe, it, expect, vi } from "vitest";
import {
  runWorker,
  retrySeconds,
  providerId,
  validateCommand,
  type WorkerDeps,
  type Delivery,
} from "../../supabase/functions/social/core";
const row: Delivery = {
  id: "id",
  trip_id: "trip",
  recipient_id: "recipient",
  event_id: "event",
  provider_key: "fixed-uuid",
  lease_token: "lease",
  attempts: 1,
};
function deps(): WorkerDeps {
  return {
    tick: vi.fn(async () => 0),
    claim: vi.fn(async () => [row]),
    payload: vi.fn(async () => ({
      title: "God stemning",
      body: "Hytta",
      url: "https://example.test/stemning",
      event_id: "event",
      trip_id: "trip",
    })),
    send: vi.fn(async () => ({ status: 200, body: { id: "provider-id" } })),
    finish: vi.fn(async () => true),
  };
}
describe("social durable delivery worker", () => {
  it("marks acceptance only with provider ID", async () => {
    const d = deps();
    expect(await runWorker(d)).toEqual({ claimed: 1, accepted: 1 });
    expect(d.finish).toHaveBeenCalledWith(
      row,
      "accepted",
      "provider-id",
      null,
      1,
    );
  });
  it("200 without ID is not a delivery receipt", async () => {
    const d = deps();
    d.send = vi.fn(async () => ({
      status: 200,
      body: { errors: ["not subscribed"] },
    }));
    expect((await runWorker(d)).accepted).toBe(0);
    expect(d.finish).toHaveBeenCalledWith(
      row,
      "failed",
      null,
      "provider_200",
      30,
    );
  });
  it("revoked membership suppresses provider call", async () => {
    const d = deps();
    d.payload = vi.fn(async () => null);
    await runWorker(d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenCalledWith(
      row,
      "suppressed",
      null,
      "recipient_or_trip_ineligible",
      1,
    );
  });
  it("honors Retry-After", async () => {
    const d = deps();
    d.send = vi.fn(async () => ({ status: 429, body: {}, retryAfter: "120" }));
    await runWorker(d);
    expect(d.finish).toHaveBeenCalledWith(
      row,
      "pending",
      null,
      "provider_429",
      120,
    );
  });
  it("lost acknowledgement retries same logical provider request", async () => {
    const d = deps();
    let first = true;
    d.finish = vi.fn(async () => {
      if (first) {
        first = false;
        throw new Error("db disconnected");
      }
      return true;
    });
    await runWorker(d);
    await runWorker(d);
    expect(d.send).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(d.send).mock.calls;
    expect(calls[0][0].provider_key).toBe(calls[1][0].provider_key);
    expect(calls[0][1]).toEqual(calls[1][1]);
  });
  it("expired lease ack never counts as accepted", async () => {
    const d = deps();
    d.finish = vi.fn(async () => false);
    expect((await runWorker(d)).accepted).toBe(0);
  });
  it("one failed recipient does not lose other queued recipients", async () => {
    const d = deps();
    d.claim = vi.fn(async () => [
      row,
      { ...row, id: "other", provider_key: "other-key" },
    ]);
    d.send = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ status: 200, body: { id: "accepted" } });
    expect(await runWorker(d)).toEqual({ claimed: 2, accepted: 1 });
    expect(d.finish).toHaveBeenCalledWith(
      row,
      "pending",
      null,
      "transport_or_ack_error",
      30,
    );
  });
  it("validates public command input and rejects worker masquerading", () => {
    const id = "00000000-0000-0000-0000-000000000001";
    expect(validateCommand({ action: "state", trip_id: id })).toBeTruthy();
    for (const body of [
      null,
      [],
      { action: "worker", trip_id: id },
      { action: "shot_start", trip_id: id },
      { action: "state", trip_id: "other" },
      { action: "respond", trip_id: id, key: id, text: "a".repeat(161) },
    ])
      expect(() => validateCommand(body)).toThrow();
  });
  it("bounds retries and provider error shapes", () => {
    expect(retrySeconds("600", 1)).toBe(600);
    expect(retrySeconds("invalid", 2)).toBe(60);
    expect(retrySeconds("999999", 1)).toBe(86400);
    expect(providerId(200, { id: "x", errors: "failed" })).toBeNull();
    expect(providerId(500, { id: "x" })).toBeNull();
  });
});
