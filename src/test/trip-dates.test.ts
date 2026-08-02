import { describe, it, expect } from "vitest";
import { tripDaysUntilStart, VAL_THORENS_2027 as ACTIVE_TRIP } from "@/config/trip";

describe("tripDaysUntilStart", () => {
  it("returnerer null når startdato ikke er bekreftet", () => {
    const trip = { ...ACTIVE_TRIP, startDate: null };
    expect(tripDaysUntilStart(trip, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });

  it("regner ut antall dager til en kjent framtidig dato", () => {
    const trip = { ...ACTIVE_TRIP, startDate: "2027-02-10" };
    const now = new Date("2027-02-01T00:00:00Z");
    expect(tripDaysUntilStart(trip, now)).toBe(9);
  });

  it("returnerer 0 eller negativt tall når datoen er passert", () => {
    const trip = { ...ACTIVE_TRIP, startDate: "2027-02-01" };
    const now = new Date("2027-02-05T00:00:00Z");
    const days = tripDaysUntilStart(trip, now);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThanOrEqual(0);
  });
});
