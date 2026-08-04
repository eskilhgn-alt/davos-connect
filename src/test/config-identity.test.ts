/**
 * Atferdstester for konfigurasjonsspesifikk identitet og turkontekst-herding.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { buildWeatherIdentity } from "@/features/weather/weatherIdentity";
import { resolveDestination } from "@/features/destination/resolveDestination";
import { mergeReloadedTrips, resolveSelectedTripId, applySavedTripRow } from "@/features/trip/tripSync";
import { dropDestinationCaches } from "@/contexts/TripContext";
import type { Trip } from "@/hooks/useActiveTrip";

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: "t1",
  name: "Tur",
  destination: "Val Thorens",
  country: "Frankrike",
  timezone: "Europe/Paris",
  currency: "EUR",
  start_date: null,
  end_date: null,
  status: "active",
  destination_config: {},
  ...over,
});

const v1 = trip({ destination_config: { center: { lat: 45.2978, lon: 6.5802 } } });
const v2 = trip({ destination_config: { center: { lat: 45.4, lon: 6.7 } } });

let selected: Trip = v1;
vi.mock("@/contexts/TripContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/TripContext")>(
    "@/contexts/TripContext",
  );
  return { ...actual, useTrip: () => ({ selectedTrip: selected, selectedTripId: selected.id }) };
});

const fetchWeatherAt = vi.fn();
vi.mock("@/services/tripWeather", () => ({
  fetchWeatherAt: (...a: unknown[]) => fetchWeatherAt(...a),
}));

function payload(label: string) {
  return {
    fetchedAt: new Date().toISOString(),
    timezone: "Europe/Paris",
    location: { lat: 0, lon: 0, label },
    current: {
      temperatureC: 1, apparentTemperatureC: 1, windSpeedMs: 1, windDirectionDeg: 1,
      precipitationMm: 0, snowfallCm: 0, weatherCode: 0, isDay: true, time: null,
    },
    daily: [],
  };
}

describe("weather identity", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchWeatherAt.mockReset();
    selected = v1;
  });

  it("gir ny nøkkel når samme tur endrer config v1 → v2", () => {
    const a = buildWeatherIdentity("t1", resolveDestination(v1))!;
    const b = buildWeatherIdentity("t1", resolveDestination(v2))!;
    expect(a.key).not.toEqual(b.key);
    expect(buildWeatherIdentity("t1", resolveDestination(v1))!.key).toEqual(a.key);
  });

  it("er null uten koordinater", () => {
    expect(buildWeatherIdentity("t1", resolveDestination(trip({ destination: "Hemsedal" })))).toBeNull();
    expect(buildWeatherIdentity(null, resolveDestination(v1))).toBeNull();
  });

  it("v2 leser aldri v1-cache", async () => {
    const k1 = buildWeatherIdentity("t1", resolveDestination(v1))!.key;
    localStorage.setItem(k1, JSON.stringify({ savedAt: Date.now(), data: payload("V1") }));
    fetchWeatherAt.mockResolvedValue(payload("V2"));
    selected = v2;
    const { useTripWeather } = await import("@/hooks/useTripWeather");
    const { result } = renderHook(() => useTripWeather());
    expect(result.current.weather?.location.label).not.toBe("V1");
    await waitFor(() => expect(result.current.weather?.location.label).toBe("V2"));
  });

  it("forsinket v1-svar kan ikke overskrive v2 i UI eller cache", async () => {
    let resolveV1: (v: unknown) => void = () => undefined;
    fetchWeatherAt
      .mockImplementationOnce(() => new Promise((r) => { resolveV1 = r; }))
      .mockImplementationOnce(() => Promise.resolve(payload("V2")));
    const { useTripWeather } = await import("@/hooks/useTripWeather");
    const { result, rerender } = renderHook(() => useTripWeather());
    selected = v2;
    rerender();
    await waitFor(() => expect(result.current.weather?.location.label).toBe("V2"));
    await act(async () => {
      resolveV1(payload("V1"));
      await Promise.resolve();
    });
    expect(result.current.weather?.location.label).toBe("V2");
    const k1 = buildWeatherIdentity("t1", resolveDestination(v1))!.key;
    expect(localStorage.getItem(k1)).toBeNull();
  });
});

describe("trip membership authority", () => {
  it("fjerner tilgang når medlemslisten er autoritativt tom", () => {
    const merged = mergeReloadedTrips([v1], [], { ok: true, membershipAuthoritative: true });
    expect(merged).toEqual([]);
    expect(resolveSelectedTripId("t1", merged)).toBeNull();
  });

  it("bevarer state ved feilet/foreldet lesing", () => {
    expect(mergeReloadedTrips([v1], [], { ok: false })).toEqual([v1]);
    expect(mergeReloadedTrips([v1], [], { ok: true, stale: true })).toEqual([v1]);
    expect(mergeReloadedTrips([v1], [], { ok: true })).toEqual([v1]);
  });

  it("autoritativ save oppdaterer nøyaktig én rad og bevarer valgt tur", () => {
    const other = trip({ id: "t2", status: "archived" });
    const next = applySavedTripRow([v1, other], trip({ id: "t2", status: "active", name: "Ny" }));
    expect(next.find((t) => t.id === "t2")?.name).toBe("Ny");
    expect(next.find((t) => t.id === "t1")?.status).toBe("archived");
    expect(resolveSelectedTripId("t1", next)).toBe("t1");
  });

  it("rydder bare destinasjonscacher for den lagrede turen", () => {
    localStorage.clear();
    localStorage.setItem("trip-weather:v2:t1:a", "x");
    localStorage.setItem("guttahutte:live-status:v2:t1:lumiplan", "x");
    localStorage.setItem("trip-weather:v2:t2:a", "keep");
    dropDestinationCaches("t1");
    expect(localStorage.getItem("trip-weather:v2:t1:a")).toBeNull();
    expect(localStorage.getItem("guttahutte:live-status:v2:t1:lumiplan")).toBeNull();
    expect(localStorage.getItem("trip-weather:v2:t2:a")).toBe("keep");
  });
});
