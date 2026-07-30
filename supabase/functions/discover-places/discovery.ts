/**
 * discovery.ts — ren, testbar tolkning av turens `destination_config.discovery`.
 *
 * Kontrakt:
 *  - `destination_config.center` er ENESTE søkesenter. Klienten sender aldri
 *    koordinater.
 *  - `destination_config.discovery` styrer radius, språk, tillatte kategorier,
 *    tillatte providere, cache-TTL og filtre.
 *  - Ingen destinasjonsfallback. Mangler noe → `configured: false` med en
 *    konkret feilkode UI kan vise ærlig.
 *  - Cachenøkkelen er delt for hele turen: trip_id + stabil discovery-versjon
 *    + provider + kategori + filterversjon. Brukerposisjon inngår aldri.
 */

export const CATEGORIES = ["spise", "afterski", "aktiviteter", "praktisk"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(x: unknown): x is Category {
  return typeof x === "string" && (CATEGORIES as readonly string[]).includes(x);
}

export const DEFAULT_RADIUS_M = 3000;
export const MAX_RADIUS_M = 15000;
export const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
export const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface DiscoveryFilters {
  minRating?: number;
  minRatingCount?: number;
  openNowOnly?: boolean;
}

export interface ResolvedDiscovery {
  configured: true;
  center: { lat: number; lon: number };
  radiusM: number;
  language: string;
  categories: Category[];
  providers: string[];
  ttlSeconds: number;
  filters: DiscoveryFilters;
  /** Stabil hash av hele discovery-blokken (uten hemmeligheter). */
  version: string;
  /** Stabil hash av kun filterdelen. */
  filterVersion: string;
}

export interface UnresolvedDiscovery {
  configured: false;
  error:
    | "destination_not_configured"
    | "discovery_not_configured"
    | "provider_not_configured";
}

export type DiscoveryResult = ResolvedDiscovery | UnresolvedDiscovery;

/** Deterministisk, rekkefølgestabil hash av et JSON-lignende objekt. */
export function stableHash(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = norm((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  const s = JSON.stringify(norm(value) ?? null);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function resolveDiscovery(destinationConfig: unknown): DiscoveryResult {
  const cfg = (destinationConfig ?? {}) as Record<string, unknown>;
  const rawCenter = cfg.center as { lat?: unknown; lon?: unknown } | undefined;
  const lat = num(rawCenter?.lat);
  const lon = num(rawCenter?.lon);
  if (lat == null || lon == null) return { configured: false, error: "destination_not_configured" };

  const d = cfg.discovery;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    return { configured: false, error: "discovery_not_configured" };
  }
  const disc = d as Record<string, unknown>;

  const providers = Array.isArray(disc.providers)
    ? (disc.providers as unknown[]).filter((p): p is string => typeof p === "string")
    : typeof disc.provider === "string"
      ? [disc.provider]
      : [];
  if (providers.length === 0) return { configured: false, error: "provider_not_configured" };

  const categories = Array.isArray(disc.categories)
    ? (disc.categories as unknown[]).filter(isCategory)
    : [...CATEGORIES];
  if (categories.length === 0) return { configured: false, error: "discovery_not_configured" };

  const radiusM = Math.min(MAX_RADIUS_M, Math.max(100, num(disc.radiusM) ?? DEFAULT_RADIUS_M));
  const language = typeof disc.language === "string" && disc.language.length <= 8 ? disc.language : "en";
  const ttlSeconds = Math.min(
    MAX_TTL_SECONDS,
    Math.max(60, num(disc.cacheTtlSeconds) ?? DEFAULT_TTL_SECONDS),
  );

  const rawFilters = (disc.filters && typeof disc.filters === "object" ? disc.filters : {}) as Record<
    string,
    unknown
  >;
  const filters: DiscoveryFilters = {};
  if (num(rawFilters.minRating) != null) filters.minRating = num(rawFilters.minRating)!;
  if (num(rawFilters.minRatingCount) != null) filters.minRatingCount = num(rawFilters.minRatingCount)!;
  if (typeof rawFilters.openNowOnly === "boolean") filters.openNowOnly = rawFilters.openNowOnly;

  return {
    configured: true,
    center: { lat, lon },
    radiusM,
    language,
    categories,
    providers,
    ttlSeconds,
    filters,
    version: stableHash({
      center: { lat, lon },
      radiusM,
      language,
      categories: [...categories].sort(),
      providers: [...providers].sort(),
      filters,
    }),
    filterVersion: stableHash(filters),
  };
}

/** Delt servercache-nøkkel. Aldri bruker-, posisjons- eller sesjonsavhengig. */
export function buildCacheKey(input: {
  tripId: string;
  discoveryVersion: string;
  provider: string;
  category: Category;
  filterVersion: string;
}): string {
  return [
    input.tripId,
    input.discoveryVersion,
    input.provider,
    input.category,
    input.filterVersion,
  ].join("|");
}

export function applyFilters<
  T extends { rating: number | null; ratingCount: number | null; openNow: boolean | null },
>(places: T[], filters: DiscoveryFilters): T[] {
  return places.filter((p) => {
    if (filters.minRating != null && (p.rating ?? 0) < filters.minRating) return false;
    if (filters.minRatingCount != null && (p.ratingCount ?? 0) < filters.minRatingCount) return false;
    if (filters.openNowOnly && p.openNow !== true) return false;
    return true;
  });
}
