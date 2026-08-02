import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  destinationDraftFromTrip,
  mergeDestinationIntoConfig,
  parseDestinationDraft,
  valThorensDestinationPreset,
  valThorensRuntimePatch,
  EMPTY_DESTINATION_DRAFT,
} from "@/features/destination/destinationDraft";
import { verifySavedTrip } from "@/components/admin/AdminTrips";
import type { Trip } from "@/hooks/useActiveTrip";

const vtTrip = {
  id: "8727cbc3-cbbe-48d7-a09e-d3c3074f9029",
  name: "Val Thorens 2027",
  destination: "Val Thorens",
  country: "France",
  timezone: "Europe/Paris",
  currency: "EUR",
  start_date: null,
  end_date: null,
  status: "active",
  destination_config: {
    center: { lat: 45.2977, lon: 6.5804 },
    avalancheUrl: "https://www.valthorens.com/en/ski/securite-secours/",
    trailMapUrl: "https://www.valthorens.com/en/ski/plan/",
    weatherUrl: "https://meteofrance.com/meteo-montagne/val-thorens/732573",
    webcamsUrl: "https://www.valthorens.com/en/webcams/",
  },
} as unknown as Trip;

const otherTrip = {
  ...vtTrip,
  id: "trip-b",
  name: "Hemsedal 2028",
  destination: "Hemsedal",
  destination_config: {},
} as unknown as Trip;

// -- Ingen ACTIVE_TRIP i operativ kode --------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/__tests__|\/test$/.test(p)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

describe("ingen global ACTIVE_TRIP-standard", () => {
  it("ingen operativ fil importerer eller bruker ACTIVE_TRIP", () => {
    const root = path.resolve(process.cwd(), "src");
    const offenders = walk(root)
      .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
      .filter((f) => /\bACTIVE_TRIP\b/.test(fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });

  it("vær-API krever eksplisitt punkt og har ingen standardtur", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/services/tripWeather.ts"), "utf8");
    expect(src).not.toMatch(/fetchTripWeather/);
    expect(src).toMatch(/export async function fetchWeatherAt\(\s*point: WeatherPoint/);
    expect(src).not.toMatch(/= ACTIVE_TRIP/);
  });

  it("datohjelperne krever eksplisitt tur", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/config/trip.ts"), "utf8");
    expect(src).toMatch(/tripHasConfirmedDates\(trip: TripConfig\)/);
    expect(src).toMatch(/tripDaysUntilStart\(trip: TripConfig, now/);
  });
});

// -- Validering --------------------------------------------------------------

describe("parseDestinationDraft", () => {
  const base = { timezone: "Europe/Paris", currency: "EUR", lat: "45.2977", lon: "6.5804", elevation: "", zoom: "13" };

  it("godtar gyldige verdier", () => {
    const r = parseDestinationDraft(base);
    expect(r.error).toBeNull();
    expect(r.value).toMatchObject({ timezone: "Europe/Paris", currency: "EUR", zoom: 13 });
    expect(r.value!.center).toEqual({ lat: 45.2977, lon: 6.5804 });
  });

  it("avviser manglende senter", () => {
    expect(parseDestinationDraft({ ...base, lat: "", lon: "" }).error).toBeTruthy();
  });

  it("avviser koordinater utenfor gyldig område", () => {
    expect(parseDestinationDraft({ ...base, lat: "91" }).error).toBeTruthy();
    expect(parseDestinationDraft({ ...base, lon: "181" }).error).toBeTruthy();
    expect(parseDestinationDraft({ ...base, lat: "NaN" }).error).toBeTruthy();
  });

  it("avviser ugyldig tidssone, valuta og zoom", () => {
    expect(parseDestinationDraft({ ...base, timezone: "Mars/Olympus" }).error).toBeTruthy();
    expect(parseDestinationDraft({ ...base, currency: "EURO" }).error).toBeTruthy();
    expect(parseDestinationDraft({ ...base, zoom: "42" }).error).toBeTruthy();
  });

  it("tom draft (kun dato satt i skjemaet) gir ingen destinasjonskonfig", () => {
    const r = parseDestinationDraft(EMPTY_DESTINATION_DRAFT);
    expect(r.error).toBeTruthy();
    expect(r.value).toBeNull();
  });
});

// -- Merge -------------------------------------------------------------------

describe("mergeDestinationIntoConfig", () => {
  it("bevarer discovery, webcams og ukjente legacy-felter", () => {
    const existing = {
      discovery: { providers: ["google-places"], categories: ["eat"] },
      webcams: [{ id: "x" }],
      trailMapUrl: "https://www.valthorens.com/en/ski/plan/",
      ukjentLegacyFelt: { beholdes: true },
      center: { lat: 1, lon: 2, elevation: 999 },
    };
    const parsed = parseDestinationDraft({
      timezone: "Europe/Paris",
      currency: "EUR",
      lat: "45.2977",
      lon: "6.5804",
      elevation: "",
      zoom: "13",
    });
    const merged = mergeDestinationIntoConfig(existing, parsed.value!);
    expect(merged.discovery).toEqual(existing.discovery);
    expect(merged.webcams).toEqual(existing.webcams);
    expect(merged.trailMapUrl).toBe(existing.trailMapUrl);
    expect(merged.ukjentLegacyFelt).toEqual({ beholdes: true });
    expect(merged.center).toEqual({ lat: 45.2977, lon: 6.5804, elevation: 999 });
    expect(merged.zoom).toBe(13);
  });
});

// -- Preset ------------------------------------------------------------------

describe("Val Thorens-preset", () => {
  it("vises bare for verifisert Val Thorens", () => {
    expect(valThorensDestinationPreset(vtTrip)).not.toBeNull();
    expect(valThorensDestinationPreset(otherTrip)).toBeNull();
    expect(valThorensRuntimePatch(otherTrip, {})).toBeNull();
  });

  it("fyller eksakte kjente verdier og aldri gjettede koordinater", () => {
    const p = valThorensDestinationPreset(vtTrip)!;
    expect(p.timezone).toBe("Europe/Paris");
    expect(p.currency).toBe("EUR");
    expect(Number(p.lat)).toBeGreaterThan(45.2);
    expect(Number(p.lat)).toBeLessThan(45.4);
    expect(Number(p.zoom)).toBe(13);
  });

  it("runtime-patch normaliserer legacy-URL-er uten å slette dem", () => {
    const patched = valThorensRuntimePatch(vtTrip, vtTrip.destination_config as Record<string, unknown>)!;
    expect(patched.trailMapUrl).toBe("https://www.valthorens.com/en/ski/plan/");
    expect(patched.weatherUrl).toBe("https://meteofrance.com/meteo-montagne/val-thorens/732573");
    const links = patched.officialLinks as Record<string, { url: string; embeddable?: boolean }>;
    expect(links.trailMap.url).toBe("https://www.valthorens.com/en/ski/plan/");
    expect(links.avalanche.url).toBe("https://www.valthorens.com/en/ski/securite-secours/");
    expect(links.trailMap.embeddable).toBe(false);
    expect(Array.isArray(patched.peaks)).toBe(true);
  });
});

// -- Lagringsverifisering ----------------------------------------------------

describe("verifySavedTrip", () => {
  const expected = {
    startDate: null,
    endDate: null,
    discoveryVersion: null,
    timezone: "Europe/Paris",
    currency: "EUR",
    center: { lat: 45.2977, lon: 6.5804 },
    zoom: 13,
  };
  const row = {
    start_date: null,
    end_date: null,
    timezone: "Europe/Paris",
    currency: "EUR",
    destination_config: { center: { lat: 45.2977, lon: 6.5804 }, zoom: 13 },
  };

  it("godkjenner en fullt persistert rad", () => {
    expect(verifySavedTrip(row, expected)).toBeNull();
  });

  it("feiler ved manglende bekreftelse", () => {
    expect(verifySavedTrip(null, expected)).toBeTruthy();
  });

  it("feiler ved mismatch i tidssone, valuta, senter eller zoom", () => {
    expect(verifySavedTrip({ ...row, timezone: "Europe/Oslo" }, expected)).toBeTruthy();
    expect(verifySavedTrip({ ...row, currency: "NOK" }, expected)).toBeTruthy();
    expect(
      verifySavedTrip({ ...row, destination_config: { center: { lat: 1, lon: 2 }, zoom: 13 } }, expected),
    ).toBeTruthy();
    expect(
      verifySavedTrip(
        { ...row, destination_config: { center: { lat: 45.2977, lon: 6.5804 }, zoom: 9 } },
        expected,
      ),
    ).toBeTruthy();
  });
});

describe("destinationDraftFromTrip", () => {
  it("leser eksisterende verdier uten gjetting", () => {
    expect(destinationDraftFromTrip(vtTrip)).toEqual({
      timezone: "Europe/Paris",
      currency: "EUR",
      lat: "45.2977",
      lon: "6.5804",
      elevation: "",
      zoom: "",
    });
    expect(destinationDraftFromTrip(otherTrip).lat).toBe("");
  });
});
