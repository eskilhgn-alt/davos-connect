/**
 * Tester for admin-lagring: mobilark over bottom-nav + én verifisert,
 * sammenhengende turoppdatering.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  applySavedTripRow,
  mergeReloadedTrips,
  normalizeRpcTripRow,
  resolveSelectedTripId,
} from "@/features/trip/tripSync";
import { resolveDestination } from "@/features/destination/resolveDestination";
import type { Trip } from "@/hooks/useActiveTrip";

const tripA = {
  id: "trip-a",
  name: "Val Thorens 2027",
  destination: "Val Thorens",
  country: "France",
  timezone: "Europe/Paris",
  currency: "EUR",
  start_date: null,
  end_date: null,
  status: "active",
  destination_config: { center: { lat: 45.2977, lon: 6.5804 } },
} as unknown as Trip;

const tripB = {
  ...tripA,
  id: "trip-b",
  name: "Hemsedal 2028",
  destination: "Hemsedal",
  status: "archived",
  destination_config: {},
} as unknown as Trip;

const adminSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/admin/AdminTrips.tsx"),
  "utf8",
);
const navSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/layout/BottomNavigation.tsx"),
  "utf8",
);

describe("1) mobilarket kan alltid lagres", () => {
  it("overlayet ligger over bottom-nav", () => {
    expect(navSrc).toContain("z-50");
    expect(adminSrc).toContain("z-[70]");
    expect(adminSrc).not.toContain('className="fixed inset-0 z-50 bg-black/40');
  });

  it("har flex-column ark med egen scrollbody og ikke-rullende footer", () => {
    expect(adminSrc).toContain("flex flex-col overflow-hidden");
    expect(adminSrc).toContain('data-testid="trip-form-body"');
    expect(adminSrc).toContain("flex-1 min-h-0 overflow-y-auto");
    expect(adminSrc).toContain('data-testid="trip-form-footer"');
    expect(adminSrc).toContain("shrink-0 flex justify-end");
  });

  it("footer respekterer safe-area og har robust form-semantikk", () => {
    expect(adminSrc).toContain("env(safe-area-inset-bottom)");
    expect(adminSrc).toContain("onSubmit={onSubmit}");
    expect(adminSrc).toContain('type="submit"');
    expect(adminSrc).toContain('type="button"');
    expect(adminSrc).toContain("if (saving) return; // hindrer dobbel innsending");
  });
});

describe("2) verifisert rad oppdaterer riktig tur", () => {
  it("erstatter bare den lagrede turen og bevarer andre", () => {
    const saved = { ...tripA, start_date: "2027-03-06", end_date: "2027-03-13" } as Trip;
    const next = applySavedTripRow([tripA, tripB], saved);
    expect(next.find((t) => t.id === "trip-a")?.start_date).toBe("2027-03-06");
    expect(next.find((t) => t.id === "trip-b")).toEqual(tripB);
  });

  it("aktivering av én tur arkiverer implisitt tidligere aktiv tur", () => {
    const list = [tripA, { ...tripB, status: "archived" } as Trip];
    const next = applySavedTripRow(list, { ...tripB, status: "active" } as Trip);
    expect(next.find((t) => t.id === "trip-b")?.status).toBe("active");
    expect(next.find((t) => t.id === "trip-a")?.status).toBe("archived");
  });

  it("normaliserer RPC-retur (rad eller array)", () => {
    expect(normalizeRpcTripRow([tripA])?.id).toBe("trip-a");
    expect(normalizeRpcTripRow(tripA)?.id).toBe("trip-a");
    expect(normalizeRpcTripRow(null)).toBeNull();
    expect(normalizeRpcTripRow({})).toBeNull();
  });
});

describe("3) valgt trip_id bevares", () => {
  it("beholder valgt tur etter lagring", () => {
    const next = applySavedTripRow([tripA, tripB], { ...tripB, name: "Nytt navn" } as Trip);
    expect(resolveSelectedTripId("trip-b", next)).toBe("trip-b");
  });

  it("faller til aktiv tur bare når valgt tur er borte", () => {
    expect(resolveSelectedTripId("borte", [tripA, tripB])).toBe("trip-a");
    expect(resolveSelectedTripId(null, [tripA, tripB])).toBe("trip-a");
  });
});

describe("4) feilet/stale lesing ruller ikke tilbake", () => {
  it("feilet lesing bevarer eksisterende turer", () => {
    expect(mergeReloadedTrips([tripA], [], { ok: false })).toEqual([tripA]);
    expect(mergeReloadedTrips([tripA], null)).toEqual([tripA]);
  });

  it("stale svar overskriver ikke nyere tilstand", () => {
    const newer = [{ ...tripA, name: "Nyere" } as Trip];
    expect(mergeReloadedTrips(newer, [tripA], { stale: true })).toEqual(newer);
  });

  it("tom liste tømmer ikke eksisterende turer", () => {
    expect(mergeReloadedTrips([tripA], [])).toEqual([tripA]);
  });

  it("TripContext bruker generasjonsvakt og merge", () => {
    const ctx = fs.readFileSync(
      path.resolve(__dirname, "../contexts/TripContext.tsx"),
      "utf8",
    );
    expect(ctx).toContain("generation");
    expect(ctx).toContain("mergeReloadedTrips");
    expect(ctx).toContain("resolveSelectedTripId");
    expect(ctx).toContain("applySavedTrip");
  });
});

describe("5) synk ventes før lukking/suksess", () => {
  it("onSaved er asynkron og await-es etter verifisert synk", () => {
    expect(adminSrc).toContain("onSaved: () => Promise<void> | void;");
    expect(adminSrc).toContain("await applySavedTrip(savedRow)");
    expect(adminSrc).toContain("await onSaved();");
    expect(adminSrc).toContain('queryKey: ["trips", "list"]');
    expect(adminSrc).toContain("reloadTrips");
  });

  it("ingen ekstra konkurrerende refetch etter lagring", () => {
    expect(adminSrc).not.toContain("useActiveTrip(");
    expect(adminSrc).not.toContain("await refetch()");
  });
});

describe("6) aktivering/arkivering bruker samme synk", () => {
  it("runRpc synker returnert rad inn i kanonisk tilstand", () => {
    expect(adminSrc).toContain("const row = normalizeRpcTripRow(data);");
    expect(adminSrc).toContain("if (row) await applySavedTrip(row);");
    expect(adminSrc).toContain("else await reloadTrips();");
  });
});

describe("7) lagret rad er umiddelbart synlig for avhengige resolvere", () => {
  it("ny config fra lagret rad brukes av resolveDestination", () => {
    const saved = {
      ...tripA,
      start_date: "2027-03-06",
      timezone: "Europe/Oslo",
      destination_config: { center: { lat: 60.0, lon: 10.0 }, zoom: 12 },
    } as Trip;
    const next = applySavedTripRow([tripA, tripB], saved);
    const updated = next.find((t) => t.id === "trip-a")!;
    const runtime = resolveDestination(updated);
    expect(runtime.center).toEqual({ lat: 60.0, lon: 10.0 });
    expect(updated.start_date).toBe("2027-03-06");
    // Andre turer beholder sin egen konfigurasjon (ingen VT-fallback).
    expect(next.find((t) => t.id === "trip-b")?.destination_config).toEqual({});
  });
});
