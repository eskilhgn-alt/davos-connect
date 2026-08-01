/**
 * Oppdag — admin-konfigurasjon, tomtilstander og cache-invalidasjon.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  resolveDiscoveryConfig,
  mergeDiscoveryIntoConfig,
  discoveryDraftFromConfig,
  valThorensDiscoveryPreset,
  discoveryError,
  validateDiscoveryDraft,
  buildClientCacheKey,
} from "@/features/discover/discoveryConfig";
import { resolveDiscovery } from "../../supabase/functions/discover-places/discovery";
import { verifySavedTrip } from "@/components/admin/AdminTrips";
import { NOT_CONFIGURED_TEXT } from "@/pages/DiscoverScreen";

const VT_TRIP = {
  id: "8727cbc3-cbbe-48d7-a09e-d3c3074f9029",
  destination: "Val Thorens",
  destination_config: {
    center: { lat: 45.2977, lon: 6.5804 },
    pisteMap: { url: "https://example.com/map", title: "Kart" },
    weather: { provider: "open-meteo" },
    webcams: [{ id: "a" }],
  } as Record<string, unknown>,
};

describe("Oppdag-konfigurasjon", () => {
  it("dato alene konfigurerer ikke Oppdag", () => {
    const cfg = { ...VT_TRIP.destination_config };
    const res = resolveDiscoveryConfig(cfg);
    expect(res.configured).toBe(false);
    expect(discoveryError(res)).toBe("discovery_not_configured");
    // datoer bor på trips-raden og inngår aldri i configen
    expect(JSON.stringify(cfg)).not.toContain("start_date");
  });

  it("gyldig config gjør turen konfigurert", () => {
    const merged = mergeDiscoveryIntoConfig(VT_TRIP.destination_config, {
      providers: ["google-places"],
      categories: ["spise", "afterski", "aktiviteter", "praktisk"],
      radiusM: 4000,
      language: "no",
      cacheTtlSeconds: 21600,
      filters: {},
    });
    const res = resolveDiscoveryConfig(merged);
    expect(res.configured).toBe(true);
    if (res.configured) expect(res.center).toEqual({ lat: 45.2977, lon: 6.5804 });
  });

  it("merge bevarer eksisterende configfelter", () => {
    const merged = mergeDiscoveryIntoConfig(VT_TRIP.destination_config, {
      providers: ["google-places"],
      categories: ["spise"],
      radiusM: 3000,
      language: "no",
      cacheTtlSeconds: 3600,
      filters: {},
    });
    expect(merged.center).toEqual({ lat: 45.2977, lon: 6.5804 });
    expect(merged.pisteMap).toEqual(VT_TRIP.destination_config.pisteMap);
    expect(merged.weather).toEqual(VT_TRIP.destination_config.weather);
    expect(merged.webcams).toEqual(VT_TRIP.destination_config.webcams);
  });

  it("annen tur arver aldri Val Thorens-preset", () => {
    expect(
      valThorensDiscoveryPreset({
        id: "other",
        destination: "Hemsedal",
        destination_config: { center: { lat: 60.8, lon: 8.5 } },
      } as never),
    ).toBeNull();
    // Val Thorens uten verifisert senter → ingen koordinatgjetting
    expect(
      valThorensDiscoveryPreset({
        id: "x",
        destination: "Val Thorens",
        destination_config: {},
      } as never),
    ).toBeNull();
    expect(valThorensDiscoveryPreset(VT_TRIP as never)).toMatchObject({
      providers: ["google-places"],
      language: "no",
    });
  });

  it("klient og server tolker discovery identisk (samme versjonshash)", () => {
    const merged = mergeDiscoveryIntoConfig(VT_TRIP.destination_config, {
      providers: ["google-places"],
      categories: ["spise", "praktisk"],
      radiusM: 5000,
      language: "no",
      cacheTtlSeconds: 3600,
      filters: { minRating: 4 },
    });
    const client = resolveDiscoveryConfig(merged);
    const server = resolveDiscovery(merged);
    expect(client.configured && server.configured).toBe(true);
    if (client.configured && server.configured) {
      expect(client.version).toBe(server.version);
      expect(client.filterVersion).toBe(server.filterVersion);
    }
  });

  it("validerer draft", () => {
    expect(
      validateDiscoveryDraft({
        providers: [],
        categories: ["spise"],
        radiusM: 3000,
        language: "no",
        cacheTtlSeconds: 3600,
        filters: {},
      }),
    ).toMatch(/tilbyder/i);
    expect(
      validateDiscoveryDraft({
        providers: ["google-places"],
        categories: [],
        radiusM: 3000,
        language: "no",
        cacheTtlSeconds: 3600,
        filters: {},
      }),
    ).toMatch(/kategori/i);
    expect(
      validateDiscoveryDraft({
        providers: ["google-places"],
        categories: ["spise"],
        radiusM: 99999,
        language: "no",
        cacheTtlSeconds: 3600,
        filters: {},
      }),
    ).toMatch(/Radius/);
  });

  it("draft leses fra eksisterende config uten gjetting", () => {
    expect(discoveryDraftFromConfig({}).providers).toEqual([]);
    expect(discoveryDraftFromConfig({}).categories).toEqual([]);
  });
});

describe("lagringskontrakt i Admin > Turer", () => {
  it("avviser falsk suksess når datoer ikke ble lagret", () => {
    expect(
      verifySavedTrip(
        { start_date: null, end_date: null, destination_config: {} },
        { startDate: "2027-03-06", endDate: "2027-03-13", discoveryVersion: null },
      ),
    ).toMatch(/Startdato/);
  });

  it("avviser falsk suksess når discovery ikke ble lagret", () => {
    expect(
      verifySavedTrip(
        { start_date: "2027-03-06", end_date: "2027-03-13", destination_config: {} },
        { startDate: "2027-03-06", endDate: "2027-03-13", discoveryVersion: "abc" },
      ),
    ).toMatch(/Oppdag/);
  });

  it("godtar verifisert rad", () => {
    const merged = mergeDiscoveryIntoConfig(VT_TRIP.destination_config, {
      providers: ["google-places"],
      categories: ["spise"],
      radiusM: 3000,
      language: "no",
      cacheTtlSeconds: 3600,
      filters: {},
    });
    const res = resolveDiscoveryConfig(merged);
    expect(
      verifySavedTrip(
        { start_date: "2027-03-06", end_date: "2027-03-13", destination_config: merged },
        {
          startDate: "2027-03-06",
          endDate: "2027-03-13",
          discoveryVersion: res.configured ? res.version : null,
        },
      ),
    ).toBeNull();
  });

  it("sender destination_config og invaliderer trips-lista", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/admin/AdminTrips.tsx"),
      "utf8",
    );
    expect(src).toContain("p_destination_config");
    expect(src).toContain('queryKey: ["trips", "list"]');
    expect(src).toContain("reloadTrips");
  });
});

describe("tomtilstander", () => {
  it("skiller mellom manglende senter, config og provider", () => {
    expect(Object.keys(NOT_CONFIGURED_TEXT).sort()).toEqual([
      "destination_not_configured",
      "discovery_not_configured",
      "provider_not_configured",
    ]);
    for (const v of Object.values(NOT_CONFIGURED_TEXT)) {
      expect(v.admin).not.toEqual(v.member);
      expect(v.member).not.toMatch(/destination_config|provider|RPC/);
    }
  });

  it("admin-CTA åpner riktig tur i Admin > Turer, medlemmer får ikke-teknisk tekst", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../pages/DiscoverScreen.tsx"), "utf8");
    expect(src).toContain("/admin?tab=trips&trip=");
    expect(src).toContain("Konfigurer Oppdag");
    expect(src).toMatch(/isAdmin \? text\.admin : text\.member/);
  });

  it("arkivert tur henter ikke dynamisk feed", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../features/discover/useDiscover.ts"),
      "utf8",
    );
    expect(src).toMatch(/if \(archived\) return reset\(\);/);
    const fn = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/discover-places/index.ts"),
      "utf8",
    );
    expect(fn).toContain('trip.status !== "active"');
  });
});

describe("klientcache og race", () => {
  it("cache-key endres ved config-, provider- og filterendring", () => {
    const base = {
      tripId: "t1",
      configVersion: "v1",
      provider: "google-places",
      category: "spise" as const,
      filterVersion: "f1",
    };
    const k = buildClientCacheKey(base);
    expect(buildClientCacheKey({ ...base, configVersion: "v2" })).not.toBe(k);
    expect(buildClientCacheKey({ ...base, provider: "other" })).not.toBe(k);
    expect(buildClientCacheKey({ ...base, filterVersion: "f2" })).not.toBe(k);
    expect(buildClientCacheKey({ ...base, tripId: "t2" })).not.toBe(k);
    expect(buildClientCacheKey(base)).toBe(k);
    // ingen posisjon i keyen
    expect(k).not.toMatch(/lat|lon|position/);
  });

  it("A→B og v1→v2 forkastes via generation-guard", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../features/discover/useDiscover.ts"),
      "utf8",
    );
    expect(src).toContain("const gen = ++generation.current");
    expect(src).toContain("if (gen !== generation.current) return;");
    expect(src).toContain("configVersion");
    expect(src).toMatch(/payload\.tripId !== selectedTripId/);
  });
});

describe("pending migrasjon", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations-pending/20260730_discover_place_cache.sql"),
    "utf8",
  );

  it("inneholder ingen destruktive setninger", () => {
    const body = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .toUpperCase();
    expect(body).not.toContain("DROP COLUMN");
    expect(body).not.toContain("DROP TABLE");
    expect(body).not.toContain("DELETE FROM");
    expect(body).not.toContain("TRUNCATE");
  });

  it("er service-role-only med RLS og uten klientgrants", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT ALL ON public.discover_place_cache TO service_role");
    expect(sql).not.toMatch(/GRANT [^;]*TO (anon|authenticated)/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.discover_place_cache_guard()");
  });

  it("er idempotent for tabell, indeks og trigger", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toContain("FROM pg_trigger t");
  });

  it("lagrer ingen providerinnhold eller brukerposisjon", () => {
    expect(sql).not.toMatch(/\bname text\b|\baddress\b|\brating\b|photo/i);
    expect(sql).not.toMatch(/user_id|user_lat|position/);
  });
});
