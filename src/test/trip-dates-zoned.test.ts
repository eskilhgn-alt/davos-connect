import { describe, it, expect } from "vitest";
import {
  zonedDateKey,
  zonedStartOfDay,
  formatTripDateRange,
  tripPhase,
  daysUntilTripStart,
  tripDayNumber,
  isWithinTripDates,
  validateTripDates,
  tripWindow,
  addDaysToKey,
} from "@/features/trip/tripDates";

const trip = {
  start_date: "2027-02-10",
  end_date: "2027-02-17",
  timezone: "Europe/Paris",
};

describe("zoned trip dates", () => {
  it("bruker turens tidssone rundt midnatt, ikke UTC", () => {
    // 23:30 lokal tid i Paris = 22:30 UTC → lokal dato er fortsatt 10. feb.
    expect(zonedDateKey("2027-02-10T22:30:00Z", "Europe/Paris")).toBe("2027-02-10");
    // 00:30 lokal tid = 23:30 UTC dagen før → lokal dato er 11. feb.
    expect(zonedDateKey("2027-02-10T23:30:00Z", "Europe/Paris")).toBe("2027-02-11");
  });

  it("håndterer DST-overgangen (sommertid) uten drift", () => {
    // 28. mars 2027 er DST-start i Europa: midnatt er UTC+1, dagen etter UTC+2.
    expect(zonedStartOfDay("2027-03-28", "Europe/Paris").toISOString()).toBe("2027-03-27T23:00:00.000Z");
    expect(zonedStartOfDay("2027-03-29", "Europe/Paris").toISOString()).toBe("2027-03-28T22:00:00.000Z");
    expect(addDaysToKey("2027-03-28", 1)).toBe("2027-03-29");
  });

  it("inkluderer hele sluttdagen i turvinduet", () => {
    const w = tripWindow(trip)!;
    expect(w.endExclusive.toISOString()).toBe("2027-02-17T23:00:00.000Z");
    // 17. feb kl 20 lokal er fortsatt «ongoing».
    expect(tripPhase(trip, new Date("2027-02-17T19:00:00Z"))).toBe("ongoing");
    expect(tripPhase(trip, new Date("2027-02-17T23:30:00Z"))).toBe("ended");
  });

  it("gir riktig fase før/under/etter", () => {
    expect(tripPhase(trip, new Date("2027-02-01T12:00:00Z"))).toBe("upcoming");
    expect(tripPhase(trip, new Date("2027-02-12T12:00:00Z"))).toBe("ongoing");
    expect(tripPhase({ ...trip, start_date: null }, new Date())).toBe("unknown");
  });

  it("teller hele dager til start i turens tidssone", () => {
    expect(daysUntilTripStart(trip, new Date("2027-02-01T23:30:00Z"))).toBe(8); // lokal 2. feb
    expect(daysUntilTripStart(trip, new Date("2027-02-10T08:00:00Z"))).toBe(0);
    expect(daysUntilTripStart({ ...trip, start_date: null })).toBeNull();
  });

  it("gir turdag 1..n og markerer datoer utenfor turen", () => {
    expect(tripDayNumber("2027-02-10", trip)).toBe(1);
    expect(tripDayNumber("2027-02-17", trip)).toBe(8);
    expect(tripDayNumber("2027-02-18", trip)).toBeNull();
    expect(isWithinTripDates("2027-02-09", trip)).toBe(false);
  });

  it("validerer start <= slutt", () => {
    expect(validateTripDates("2027-02-10", "2027-02-17")).toBe(true);
    expect(validateTripDates("2027-02-18", "2027-02-17")).toBe(false);
    expect(validateTripDates(null, "2027-02-17")).toBe(true);
  });

  it("formaterer datointervall uten new Date('YYYY-MM-DD')", () => {
    expect(formatTripDateRange(trip)).toContain("10.");
    expect(formatTripDateRange(trip)).toContain("2027");
    expect(formatTripDateRange({ ...trip, end_date: null })).toBe("Datoer ikke satt");
  });
});
