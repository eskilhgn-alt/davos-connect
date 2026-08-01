/**
 * EØS-tester for Oppdag.
 *
 * Beviser at:
 *  - Gütta-match aldri avledes av Google-innhold.
 *  - Persistent snapshot lagrer aldri rå/normalisert providerinnhold.
 *  - Snapshot-TTL er <= 30 dager og migrasjonen er idempotent.
 *  - Kartadapteren blokkerer providerinnhold uten Places UI Kit-konfig.
 *  - Personlig posisjon aldri havner i delt cache.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { guttaMatch, orderPlaces } from "@/features/discover/guttaMatch";
import {
  resolveMapCapability,
  isRestrictedProvider,
  BROWSER_KEY_NAME,
  MAP_BLOCKED_TEXT,
} from "@/features/discover/mapCapability";
import type { DiscoverPlace } from "@/features/discover/types";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
const fnSrc = read("../../supabase/functions/discover-places/index.ts");
const sql = read("../../supabase/migrations-pending/20260730_discover_place_cache.sql");
const matchSrc = read("../features/discover/guttaMatch.ts");

const place = (over: Partial<DiscoverPlace> = {}): DiscoverPlace => ({
  id: "google:a",
  name: "A",
  category: "spise",
  lat: 45.297,
  lon: 6.58,
  address: "x",
  rating: 4.9,
  ratingCount: 900,
  priceLevel: 2,
  openNow: true,
  photoUrl: null,
  providerUrl: null,
  ...over,
});

describe("EØS: ingen Google-avledet Gütta-match", () => {
  it("scorekoden refererer aldri Google-felter", () => {
    expect(matchSrc).not.toMatch(/place\.(rating|ratingCount|openNow|priceLevel)/);
  });

  it("gir «ikke nok gruppedata» selv med perfekte Google-tall", () => {
    expect(guttaMatch(place(), null).available).toBe(false);
    expect(guttaMatch(place({ rating: 1, ratingCount: 1 }), null).available).toBe(false);
  });

  it("omranger aldri på Google-innhold", () => {
    const list = [place({ id: "a", rating: 2 }), place({ id: "b", rating: 5 })];
    expect(orderPlaces(list).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("EØS: delt snapshot", () => {
  it("skriver kun place_id og koordinater", () => {
    expect(fnSrc).toContain("place_refs: placeRefs");
    expect(fnSrc).toContain("placeRefs = places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))");
    expect(fnSrc).not.toContain("payload,\n          expires_at");
    const writeBlock = fnSrc.slice(fnSrc.indexOf("const placeRefs"), fnSrc.indexOf("onConflict"));
    expect(writeBlock).not.toMatch(/name|address|rating|openNow|priceLevel|photo|review/i);
  });

  it("kapper TTL til maks 30 dager", () => {
    expect(fnSrc).toContain("MAX_SNAPSHOT_TTL_SECONDS = 30 * 24 * 60 * 60");
    expect(fnSrc).toContain("Math.min(discovery.ttlSeconds, MAX_SNAPSHOT_TTL_SECONDS)");
    expect(sql).toContain("interval '30 days'");
  });

  it("lagrer aldri personlig posisjon eller bruker-id i cachen", () => {
    const writeBlock = fnSrc.slice(fnSrc.indexOf("const placeRefs"), fnSrc.indexOf("onConflict"));
    expect(writeBlock).not.toMatch(/user_id|userId|position/);
    expect(sql).not.toMatch(/user_id|position|payload jsonb/);
  });
});

describe("migrasjon er idempotent og provider-nøytral", () => {
  it("bruker IF NOT EXISTS og ikke-destruktiv triggerguard", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.discover_place_cache");
    // Ingen DROP TRIGGER: idempotens via pg_trigger-guard, ikke destruktivt.
    expect(sql).not.toMatch(/DROP TRIGGER/);
    expect(sql).toContain("FROM pg_trigger t");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.discover_place_cache_guard");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT ALL ON public.discover_place_cache TO service_role");
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/);
  });

  it("er provider-nøytral", () => {
    const stmts = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(stmts).not.toMatch(/google/i);
  });
});

describe("EEA/provider map guard", () => {
  it("blokkerer Google Places i den generiske kartadapteren", () => {
    expect(isRestrictedProvider("google-places")).toBe(true);
    expect(resolveMapCapability({ provider: "google-places", browserKey: null })).toEqual({
      allowed: false,
      reason: "map_not_configured",
    });
    expect(MAP_BLOCKED_TEXT.map_not_configured).toContain(BROWSER_KEY_NAME);
  });

  it("tillater Places UI Kit først når klientnøkkel finnes", () => {
    expect(resolveMapCapability({ provider: "google-places", browserKey: "abc" })).toEqual({
      allowed: true,
      renderer: "places-ui-kit",
    });
  });

  it("gir ærlig tilstand uten provider", () => {
    expect(resolveMapCapability({ provider: null })).toEqual({
      allowed: false,
      reason: "no_provider",
    });
  });

  it("bruker aldri server-secret i klienten", () => {
    const src = read("../features/discover/mapCapability.ts");
    expect(src).not.toContain("GOOGLE_PLACES_API_KEY");
    expect(BROWSER_KEY_NAME).toBe("VITE_GOOGLE_MAPS_BROWSER_API_KEY");
  });
});
