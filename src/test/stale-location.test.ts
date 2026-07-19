import { describe, it, expect } from "vitest";
import { STALE_LOCATION_MS, isFreshLocation } from "@/hooks/useUserLocations";

describe("stale location filter", () => {
  const now = new Date("2027-02-10T12:00:00Z").getTime();

  it("regner en fersk posisjon som fersk", () => {
    const ts = new Date(now - 30_000).toISOString();
    expect(isFreshLocation(ts, now)).toBe(true);
  });

  it("filtrerer bort posisjoner eldre enn 10 minutter", () => {
    const ts = new Date(now - 11 * 60_000).toISOString();
    expect(isFreshLocation(ts, now)).toBe(false);
  });

  it("bruker en fornuftig terskel", () => {
    expect(STALE_LOCATION_MS).toBeGreaterThanOrEqual(60_000);
    expect(STALE_LOCATION_MS).toBeLessThanOrEqual(30 * 60_000);
  });

  it("håndterer ugyldig tidsstempel som ikke-ferskt", () => {
    expect(isFreshLocation("ikke-en-dato", now)).toBe(false);
  });
});
