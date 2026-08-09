import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mergeReloadedTrips, applySavedTripRow, resolveSelectedTripId } from "@/features/trip/tripSync";
import type { Trip } from "@/hooks/useActiveTrip";

const base: Trip = {
  id: "A",
  name: "Val Thorens 2027",
  destination: "Val Thorens",
  country: "Frankrike",
  timezone: "Europe/Paris",
  currency: "EUR",
  start_date: null,
  end_date: null,
  status: "active",
  destination_config: {},
};

describe("global datosynk", () => {
  it("verifisert lagret rad blir autoritativ for datoer, samme enhet", () => {
    const saved = { ...base, start_date: "2027-02-10", end_date: "2027-02-17" };
    const next = applySavedTripRow([base], saved);
    expect(next).toHaveLength(1);
    expect(next[0].start_date).toBe("2027-02-10");
    expect(next[0].end_date).toBe("2027-02-17");
  });

  it("A påvirker aldri valgt B", () => {
    const b: Trip = { ...base, id: "B", status: "archived" };
    const next = applySavedTripRow([base, b], { ...base, start_date: "2027-02-10" });
    expect(next.find((t) => t.id === "B")!.start_date).toBeNull();
    expect(resolveSelectedTripId("B", next)).toBe("B");
  });

  it("eldre/feilet lesing kan aldri rulle tilbake nyere datoer", () => {
    const fresh = [{ ...base, start_date: "2027-02-10" }];
    expect(mergeReloadedTrips(fresh, [base], { stale: true })[0].start_date).toBe("2027-02-10");
    expect(mergeReloadedTrips(fresh, null, { ok: false })[0].start_date).toBe("2027-02-10");
    // Fersk, autoritativ lesing vinner.
    const incoming = [{ ...base, start_date: "2027-02-11" }];
    expect(mergeReloadedTrips(fresh, incoming, { ok: true })[0].start_date).toBe("2027-02-11");
  });
});

describe("TripContext synk-kontrakt", () => {
  const ctx = readFileSync("src/contexts/TripContext.tsx", "utf8");

  it("har realtime-synk for trips (andre enheter oppdateres uten reload)", () => {
    expect(ctx).toContain('table: "trips"');
    expect(ctx).toContain("loadTripsAndMembership()");
  });

  it("refreshTrip laster turer på nytt, ikke bare invalidering", () => {
    const block = ctx.slice(ctx.indexOf("const refreshTrip"), ctx.indexOf("const value: TripContextValue"));
    expect(block).toContain("loadTripsAndMembership()");
    expect(block).toContain("invalidateTripScoped()");
  });

  it("agenda er blant de turfølsomme query-nøklene", () => {
    expect(ctx).toContain('"agenda"');
  });
});

describe("ingen parallell turstore", () => {
  it("useActiveTrip er pensjonert som runtime-hook", () => {
    const src = readFileSync("src/hooks/useActiveTrip.ts", "utf8");
    expect(src).not.toContain("export function useActiveTrip");
    expect(src).not.toContain("useQuery");
  });

  it("Hjem bruker zonede hjelpere, ikke new Date('YYYY-MM-DD')", () => {
    const home = readFileSync("src/pages/HomeScreen.tsx", "utf8");
    expect(home).toContain("formatTripDateRange");
    expect(home).toContain("tripPhase");
    expect(home).not.toContain("new Date(startDate");
  });

  it("Hjems «Neste» bruker samme turspesifikke agenda-kilde", () => {
    const dash = readFileSync("src/components/home/HomeDashboard.tsx", "utf8");
    expect(dash).toContain("useAgenda");
    expect(dash).not.toContain("from(\"agenda_events\")");
  });
});
