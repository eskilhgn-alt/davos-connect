/**
 * discoveryConfig — klientspeil av serverens `resolveDiscovery`.
 *
 * Kontrakt:
 *  - Samme tolkning og samme stabile versjonshash som
 *    `supabase/functions/discover-places/discovery.ts`. Pariteten er testet.
 *  - Brukes til (a) ærlige tomtilstander i Oppdag, (b) trygg klientcache-key
 *    som invalideres når config endres, og (c) validering i Admin > Turer.
 *  - Ingen destinasjonsfallback og ingen koordinatgjetting. Manglende felt →
 *    `configured: false` med konkret feilkode.
 *  - Datoer (start_date/end_date) påvirker ALDRI configured-status.
 *  - Personlig posisjon inngår aldri i versjon, key eller ranking.
 */
import { DISCOVER_CATEGORIES, type DiscoverCategory } from "./types";
import { isValThorensTrip } from "@/features/destination/resolveDestination";
import type { Trip } from "@/hooks/useActiveTrip";

export const DEFAULT_RADIUS_M = 3000;
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 15000;
export const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export const SUPPORTED_PROVIDERS = ["google-places"] as const;
export type DiscoveryProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface DiscoveryFilters {
  minRating?: number;
  minRatingCount?: number;
  openNowOnly?: boolean;
}

export interface DiscoveryDraft {
  providers: string[];
  categories: DiscoverCategory[];
  radiusM: number;
  language: string;
  cacheTtlSeconds: number;
  filters: DiscoveryFilters;
}

export type DiscoveryConfigError =
  | "destination_not_configured"
  | "discovery_not_configured"
  | "provider_not_configured";

export type ResolvedDiscoveryConfig =
  | {
      configured: true;
      center: { lat: number; lon: number };
      radiusM: number;
      language: string;
      categories: DiscoverCategory[];
      providers: string[];
      ttlSeconds: number;
      filters: DiscoveryFilters;
      version: string;
      filterVersion: string;
    }
  | { configured: false; error: DiscoveryConfigError };

/** Feilkode når configen ikke er komplett, ellers null. */
export function discoveryError(res: ResolvedDiscoveryConfig): DiscoveryConfigError | null {
  return res.configured ? null : (res as { error: DiscoveryConfigError }).error;
}

/** Deterministisk, rekkefølgestabil hash — identisk med serverens. */
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

function isCategory(x: unknown): x is DiscoverCategory {
  return typeof x === "string" && (DISCOVER_CATEGORIES as readonly string[]).includes(x);
}

export function resolveDiscoveryConfig(destinationConfig: unknown): ResolvedDiscoveryConfig {
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
    : [...DISCOVER_CATEGORIES];
  if (categories.length === 0) return { configured: false, error: "discovery_not_configured" };

  const radiusM = Math.min(
    MAX_RADIUS_M,
    Math.max(MIN_RADIUS_M, num(disc.radiusM) ?? DEFAULT_RADIUS_M),
  );
  const language =
    typeof disc.language === "string" && disc.language.length <= 8 ? disc.language : "en";
  const ttlSeconds = Math.min(
    MAX_TTL_SECONDS,
    Math.max(MIN_TTL_SECONDS, num(disc.cacheTtlSeconds) ?? DEFAULT_TTL_SECONDS),
  );

  const rawFilters = (
    disc.filters && typeof disc.filters === "object" ? disc.filters : {}
  ) as Record<string, unknown>;
  const filters: DiscoveryFilters = {};
  if (num(rawFilters.minRating) != null) filters.minRating = num(rawFilters.minRating)!;
  if (num(rawFilters.minRatingCount) != null)
    filters.minRatingCount = num(rawFilters.minRatingCount)!;
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

/**
 * Lokal cachenøkkel for klienten. Inkluderer config-versjon, provider,
 * kategori og filterversjon, slik at gammel config aldri gjenbrukes.
 * Aldri bruker-, posisjons- eller sesjonsavhengig.
 */
export function buildClientCacheKey(input: {
  tripId: string;
  configVersion: string;
  provider: string;
  category: DiscoverCategory;
  filterVersion: string;
}): string {
  return [
    input.tripId,
    input.configVersion,
    input.provider,
    input.category,
    input.filterVersion,
  ].join("|");
}

/**
 * Merger discovery inn i eksisterende destination_config uten å røre
 * weather/map/webcam eller andre felter.
 */
export function mergeDiscoveryIntoConfig(
  existing: Record<string, unknown> | null | undefined,
  discovery: DiscoveryDraft,
): Record<string, unknown> {
  const base = { ...(existing ?? {}) };
  const prev = (base.discovery && typeof base.discovery === "object" && !Array.isArray(base.discovery)
    ? (base.discovery as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  base.discovery = {
    ...prev,
    providers: [...discovery.providers],
    categories: [...discovery.categories],
    radiusM: discovery.radiusM,
    language: discovery.language,
    cacheTtlSeconds: discovery.cacheTtlSeconds,
    filters: { ...discovery.filters },
  };
  return base;
}

/** Leser en redigerbar draft ut av eksisterende config (uten fallback-gjetting). */
export function discoveryDraftFromConfig(
  existing: Record<string, unknown> | null | undefined,
): DiscoveryDraft {
  const resolved = resolveDiscoveryConfig(existing);
  if (resolved.configured) {
    return {
      providers: resolved.providers,
      categories: resolved.categories,
      radiusM: resolved.radiusM,
      language: resolved.language,
      cacheTtlSeconds: resolved.ttlSeconds,
      filters: resolved.filters,
    };
  }
  const disc = ((existing ?? {}) as Record<string, unknown>).discovery as
    | Record<string, unknown>
    | undefined;
  return {
    providers: Array.isArray(disc?.providers)
      ? (disc!.providers as unknown[]).filter((p): p is string => typeof p === "string")
      : [],
    categories: Array.isArray(disc?.categories)
      ? (disc!.categories as unknown[]).filter(isCategory)
      : [],
    radiusM: num(disc?.radiusM) ?? DEFAULT_RADIUS_M,
    language: typeof disc?.language === "string" ? (disc!.language as string) : "no",
    cacheTtlSeconds: num(disc?.cacheTtlSeconds) ?? DEFAULT_TTL_SECONDS,
    filters: {},
  };
}

/**
 * Trygt preset — KUN når turen faktisk er verifisert Val Thorens OG allerede
 * har et verifisert senter i sin egen config. Ingen koordinatgjetting og
 * ingen Val Thorens-verdier for andre destinasjoner.
 */
export function valThorensDiscoveryPreset(
  trip: Pick<Trip, "id" | "destination" | "destination_config"> | null | undefined,
): DiscoveryDraft | null {
  if (!trip) return null;
  if (!isValThorensTrip(trip)) return null;
  const center = (trip.destination_config as Record<string, unknown> | null)?.center as
    | { lat?: unknown; lon?: unknown }
    | undefined;
  if (num(center?.lat) == null || num(center?.lon) == null) return null;
  return {
    providers: ["google-places"],
    categories: [...DISCOVER_CATEGORIES],
    radiusM: 4000,
    language: "no",
    cacheTtlSeconds: DEFAULT_TTL_SECONDS,
    filters: {},
  };
}

/** Validerer en draft før lagring. Returnerer feilmelding eller null. */
export function validateDiscoveryDraft(draft: DiscoveryDraft): string | null {
  if (draft.providers.length === 0) return "Velg minst én stedstilbyder";
  if (draft.providers.some((p) => !(SUPPORTED_PROVIDERS as readonly string[]).includes(p)))
    return "Ukjent stedstilbyder";
  if (draft.categories.length === 0) return "Velg minst én kategori";
  if (!Number.isFinite(draft.radiusM) || draft.radiusM < MIN_RADIUS_M || draft.radiusM > MAX_RADIUS_M)
    return `Radius må være mellom ${MIN_RADIUS_M} og ${MAX_RADIUS_M} meter`;
  if (!draft.language || draft.language.length > 8) return "Ugyldig språkkode";
  return null;
}
