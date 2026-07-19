import { describe, it, expect } from "vitest";
import { STALE_LOCATION_MS } from "@/hooks/useUserLocations";

/**
 * useUserLocations skjuler foreldede posisjoner. Vi isolerer logikken slik at
 * den kan testes uten Supabase-realtime: en posisjon eldre enn
 * STALE_LOCATION_MS skal filtreres bort.
 */
function isFresh(updatedAt: string, now = Date.now()) {
  return now - new Date(updatedAt).getTime() < STALE_LOCATION_MS;
}

describe("stale location filter", () => {
  const now = new Date("2027-02-10T12:00:00Z").getTime();

  it("regner en fersk posisjon som fersk", () => {
    const ts = new Date(now - 30_000).toISOString();
    expect(isFresh(ts, now)).toBe(true);
  });

  it("filtrerer bort posisjoner eldre enn 10 minutter", () => {
    const ts = new Date(now - 11 * 60_000).toISOString();
    expect(isFresh(ts, now)).toBe(false);
  });

  it("bruker en fornuftig terskel", () => {
    expect(STALE_LOCATION_MS).toBeGreaterThanOrEqual(60_000);
    expect(STALE_LOCATION_MS).toBeLessThanOrEqual(30 * 60_000);
  });
});
