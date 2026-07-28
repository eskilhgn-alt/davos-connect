import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { resolveDestination, isValThorensTrip } from "@/features/destination/resolveDestination";
import { weatherCacheKey } from "@/hooks/useTripWeather";
import type { Trip } from "@/hooks/useActiveTrip";

const base: Trip = {
  id: "t-vt",
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

const other: Trip = {
  ...base,
  id: "t-hemsedal",
  name: "Hemsedal 2028",
  destination: "Hemsedal",
  country: "Norge",
  timezone: "Europe/Oslo",
  currency: "NOK",
  destination_config: {},
};

describe("resolveDestination", () => {
  it("gir Val Thorens eksplisitt fallback bare for Val Thorens", () => {
    expect(isValThorensTrip(base)).toBe(true);
    const d = resolveDestination(base);
    expect(d.source).toBe("val-thorens-fallback");
    expect(d.center?.lat).toBeCloseTo(45.2978, 3);
    expect(d.peaks.length).toBeGreaterThan(0);
    expect(d.pisteMap?.url).toMatch(/lumiplay\.link/);
    expect(d.liveProvider).toBe("lumiplan");
  });

  it("gir aldri Val Thorens-kart, peaks eller live-status til andre destinasjoner", () => {
    const d = resolveDestination(other);
    expect(isValThorensTrip(other)).toBe(false);
    expect(d.center).toBeNull();
    expect(d.peaks).toEqual([]);
    expect(d.pisteMap).toBeNull();
    expect(d.liveProvider).toBeNull();
    expect(d.configured).toBe(false);
    expect(d.source).toBe("none");
  });

  it("bruker destination_config når den finnes", () => {
    const d = resolveDestination({
      ...other,
      destination_config: {
        center: { lat: 60.86, lon: 8.55, elevation: 640 },
        zoom: 12,
        pisteMap: { url: "https://example.com/map", title: "Hemsedal kart" },
      },
    });
    expect(d.center).toEqual({ lat: 60.86, lon: 8.55, elevation: 640 });
    expect(d.zoom).toBe(12);
    expect(d.pisteMap?.url).toBe("https://example.com/map");
    expect(d.configured).toBe(true);
    expect(d.source).toBe("config");
    expect(d.liveProvider).toBeNull();
  });

  it("gir ærlig tomtilstand uten valgt tur", () => {
    const d = resolveDestination(null);
    expect(d.configured).toBe(false);
    expect(d.pisteMap).toBeNull();
  });
});

// -- useTripWeather: turspesifikk cache + race-guard ------------------------

let selected: Trip | null = base;
vi.mock("@/contexts/TripContext", () => ({
  useTrip: () => ({
    selectedTrip: selected,
    selectedTripId: selected?.id ?? null,
    trips: [],
    activeTrip: selected,
    isArchive: false,
    isLoading: false,
    selectTrip: async () => {},
    refreshTrip: async () => {},
  }),
}));

const fetchWeatherAt = vi.fn();
vi.mock("@/services/tripWeather", async (orig) => {
  const actual = await orig<typeof import("@/services/tripWeather")>();
  return { ...actual, fetchWeatherAt: (...args: unknown[]) => fetchWeatherAt(...args) };
});

function weather(label: string) {
  return {
    fetchedAt: new Date().toISOString(),
    timezone: "Europe/Paris",
    location: { lat: 1, lon: 2, label },
    current: {
      temperatureC: 1, apparentTemperatureC: 1, windSpeedMs: 1, windDirectionDeg: 1,
      precipitationMm: 0, snowfallCm: 0, weatherCode: 0, isDay: true, time: null,
    },
    daily: [],
  };
}

describe("useTripWeather", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchWeatherAt.mockReset();
    selected = base;
  });

  it("bruker valgt turs koordinater og turspesifikk cache-nøkkel", async () => {
    fetchWeatherAt.mockResolvedValue(weather("Val Thorens"));
    const { useTripWeather } = await import("@/hooks/useTripWeather");
    const { result } = renderHook(() => useTripWeather());
    await waitFor(() => expect(result.current.weather).not.toBeNull());
    expect(fetchWeatherAt.mock.calls[0][0]).toMatchObject({
      lat: 45.2978, lon: 6.5802, timezone: "Europe/Paris",
    });
    expect(localStorage.getItem(weatherCacheKey("t-vt"))).toBeTruthy();
    expect(localStorage.getItem(weatherCacheKey("t-hemsedal"))).toBeNull();
  });

  it("viser utilgjengelig-tilstand når turen mangler koordinater", async () => {
    selected = other;
    const { useTripWeather } = await import("@/hooks/useTripWeather");
    const { result } = renderHook(() => useTripWeather());
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(fetchWeatherAt).not.toHaveBeenCalled();
    expect(result.current.weather).toBeNull();
  });

  it("forkaster svar fra tur A etter bytte til tur B", async () => {
    let resolveA: (v: unknown) => void = () => {};
    fetchWeatherAt.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    const { useTripWeather } = await import("@/hooks/useTripWeather");
    const { result, rerender } = renderHook(() => useTripWeather());

    selected = { ...other, destination_config: { center: { lat: 60.86, lon: 8.55 } } };
    fetchWeatherAt.mockResolvedValueOnce(weather("Hemsedal"));
    rerender();
    await waitFor(() => expect(fetchWeatherAt).toHaveBeenCalledTimes(2));

    resolveA(weather("Val Thorens"));
    await waitFor(() => expect(result.current.weather?.location.label).toBe("Hemsedal"));
    expect(result.current.weather?.location.label).not.toBe("Val Thorens");
  });
});

// -- Ingen direkte ACTIVE_TRIP i destinasjonsavhengige runtime-filer --------

describe("runtime-filer bruker valgt tur, ikke ACTIVE_TRIP", () => {
  const files = [
    "src/hooks/useTripWeather.ts",
    "src/pages/WeatherScreen.tsx",
    "src/pages/MapScreen.tsx",
    "src/pages/CrewMapScreen.tsx",
    "src/components/home/HomeDashboard.tsx",
    "src/components/live/ValThorensStatus.tsx",
  ];
  it.each(files)("%s importerer ikke ACTIVE_TRIP", (file) => {
    const src = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(src).not.toMatch(/ACTIVE_TRIP/);
  });
});
