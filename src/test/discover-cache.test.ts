import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  resolveDiscovery,
  buildCacheKey,
  applyFilters,
  stableHash,
} from "../../supabase/functions/discover-places/discovery";

const CFG = {
  center: { lat: 45.297, lon: 6.58 },
  discovery: {
    providers: ["google-places"],
    radiusM: 4000,
    language: "no",
    categories: ["spise", "afterski"],
    cacheTtlSeconds: 3600,
    filters: { minRating: 4 },
  },
};

const fnSrc = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/functions/discover-places/index.ts"),
  "utf8",
);
const hookSrc = fs.readFileSync(
  path.resolve(__dirname, "../features/discover/useDiscover.ts"),
  "utf8",
);

describe("discovery-config", () => {
  it("leser radius, språk, kategorier, provider og TTL fra discovery", () => {
    const d = resolveDiscovery(CFG);
    expect(d.configured).toBe(true);
    if (!d.configured) return;
    expect(d.radiusM).toBe(4000);
    expect(d.language).toBe("no");
    expect(d.categories).toEqual(["spise", "afterski"]);
    expect(d.providers).toEqual(["google-places"]);
    expect(d.ttlSeconds).toBe(3600);
    expect(d.center).toEqual({ lat: 45.297, lon: 6.58 });
  });

  it("gir ærlige feilkoder uten destinasjonsfallback", () => {
    expect(resolveDiscovery({}).configured).toBe(false);
    expect(resolveDiscovery({})).toMatchObject({ error: "destination_not_configured" });
    expect(resolveDiscovery({ center: { lat: 1, lon: 2 } })).toMatchObject({
      error: "discovery_not_configured",
    });
    expect(
      resolveDiscovery({ center: { lat: 1, lon: 2 }, discovery: { categories: ["spise"] } }),
    ).toMatchObject({ error: "provider_not_configured" });
  });

  it("klemmer radius og TTL innenfor trygge grenser", () => {
    const d = resolveDiscovery({
      ...CFG,
      discovery: { ...CFG.discovery, radiusM: 999999, cacheTtlSeconds: 1 },
    });
    if (!d.configured) throw new Error("skulle vært konfigurert");
    expect(d.radiusM).toBe(15000);
    expect(d.ttlSeconds).toBe(60);
  });
});

describe("delt servercache-nøkkel", () => {
  const base = {
    tripId: "trip-a",
    discoveryVersion: "v1",
    provider: "google-places",
    category: "spise" as const,
    filterVersion: "f1",
  };

  it("er identisk for alle brukere av samme tur/config/provider/kategori", () => {
    expect(buildCacheKey(base)).toBe(buildCacheKey({ ...base }));
    expect(buildCacheKey(base)).not.toMatch(/user|lat|lon|position/i);
  });

  it("isoleres per tur, config, provider, kategori og filterversjon", () => {
    const k = buildCacheKey(base);
    expect(buildCacheKey({ ...base, tripId: "trip-b" })).not.toBe(k);
    expect(buildCacheKey({ ...base, discoveryVersion: "v2" })).not.toBe(k);
    expect(buildCacheKey({ ...base, provider: "other" })).not.toBe(k);
    expect(buildCacheKey({ ...base, category: "praktisk" })).not.toBe(k);
    expect(buildCacheKey({ ...base, filterVersion: "f2" })).not.toBe(k);
  });

  it("gir stabil discovery-versjon uavhengig av nøkkelrekkefølge", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    const a = resolveDiscovery(CFG);
    const b = resolveDiscovery({
      center: CFG.center,
      discovery: { ...CFG.discovery, categories: ["spise", "afterski"] },
    });
    if (!a.configured || !b.configured) throw new Error("konfig");
    expect(a.version).toBe(b.version);
    const c = resolveDiscovery({ ...CFG, discovery: { ...CFG.discovery, radiusM: 5000 } });
    if (!c.configured) throw new Error("konfig");
    expect(c.version).not.toBe(a.version);
  });

  it("filtrerer med turens filtre, ikke klientens", () => {
    const list = [
      { rating: 4.5, ratingCount: 100, openNow: true },
      { rating: 3.2, ratingCount: 100, openNow: true },
    ];
    expect(applyFilters(list, { minRating: 4 })).toHaveLength(1);
  });
});

describe("edge function: cache, arkiv og sikkerhet", () => {
  it("verifiserer medlemskap før cache leses", () => {
    const memberIdx = fnSrc.indexOf('"not_trip_member"');
    const cacheIdx = fnSrc.indexOf("CACHE_TABLE)\n      .select");
    expect(memberIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(memberIdx);
  });

  it("blokkerer arkiverte turer før providerkall", () => {
    expect(fnSrc).toContain('trip.status !== "active"');
    expect(fnSrc).toContain('"trip_archived"');
    expect(fnSrc.indexOf('trip.status !== "active"')).toBeLessThan(
      fnSrc.indexOf("places.googleapis.com"),
    );
  });

  it("skriver kun place-referanser med kappet TTL og uten posisjon/bruker", () => {
    expect(fnSrc).toContain("Math.min(discovery.ttlSeconds, MAX_SNAPSHOT_TTL_SECONDS)");
    expect(fnSrc).toContain("expires_at: new Date(Date.now() + ttlMs)");
    const upsert = fnSrc.slice(fnSrc.indexOf("CACHE_TABLE).upsert"), fnSrc.indexOf("cached: !!"));
    expect(upsert).not.toMatch(/user_id|userId|position/);
    expect(fnSrc).not.toMatch(/raw_?payload|rawResponse/i);
  });

  it("håndterer manglende cachetabell ærlig uten å lekke detaljer", () => {
    expect(fnSrc).toContain("isMissingTable");
    expect(fnSrc).toContain('cacheErr.code ?? "unknown"');
    expect(fnSrc).not.toMatch(/console\.(log|error)\([^)]*text\b/);
  });

  it("logger aldri full providerrespons eller nøkkel", () => {
    expect(fnSrc).toContain("Places request failed with status ${res.status}");
    expect(fnSrc).not.toMatch(/console\.\w+\([^)]*apiKey/);
    expect(fnSrc).toContain('Deno.env.get("GOOGLE_PLACES_API_KEY")');
  });

  it("bruker discovery-konfig, ikke top-level felter eller klientkoordinater", () => {
    expect(fnSrc).not.toContain("discoverRadiusM");
    expect(fnSrc).toContain("discovery.radiusM");
    expect(fnSrc).toContain("discovery.language");
    expect(fnSrc).not.toMatch(/body\??\.(lat|lon|latitude|longitude|radius|center|filters)/);
  });

  it("avviser kategori som ikke er slått på for turen", () => {
    expect(fnSrc).toContain('"category_not_enabled"');
  });
});

describe("klient: arkiv og cache-ærlighet", () => {
  it("henter aldri dynamisk feed for arkivert tur", () => {
    expect(hookSrc).toContain('selectedTrip.status !== "active"');
    expect(hookSrc).toContain("if (archived)");
    const screen = fs.readFileSync(path.resolve(__dirname, "../pages/DiscoverScreen.tsx"), "utf8");
    expect(screen).toContain("Arkivert tur");
  });

  it("fremstiller ikke den lokale memoiseringen som delt servercache", () => {
    expect(hookSrc).toContain("DELTE cachen bor på serveren");
  });
});

describe("migrasjon (kode-only)", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations-pending/20260730_discover_place_cache.sql"),
    "utf8",
  );

  it("er ikke-destruktiv og service-role-only med RLS på", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.discover_place_cache");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT ALL ON public.discover_place_cache TO service_role");
    expect(sql).not.toMatch(/GRANT[^;]*TO (anon|authenticated)/);
    expect(sql).not.toMatch(/CREATE POLICY/);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
  });

  it("har unik cache key, utløpstid og indeks", () => {
    expect(sql).toContain("cache_key text PRIMARY KEY");
    expect(sql).toContain("expires_at timestamptz NOT NULL");
    expect(sql).toContain("discover_place_cache_key_uidx");
    expect(sql).toContain("discover_place_cache_trip_expires_idx");
  });

  it("ligger utenfor migrations-mappen (ikke kjørt)", () => {
    const applied = fs.readdirSync(path.resolve(__dirname, "../../supabase/migrations"));
    expect(applied.some((f) => f.includes("discover_place_cache"))).toBe(false);
  });
});
