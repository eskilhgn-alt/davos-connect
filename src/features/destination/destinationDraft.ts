/**
 * destinationDraft — redigerbar, validert draft for turens destinasjonskjerne
 * (tidssone, valuta, senterkoordinat og kartzoom) som brukes av
 * Admin → Turer.
 *
 * Kontrakt:
 *  - Ingen koordinatgjetting. Admin må skrive inn eksakte verdier, eller
 *    bruke det verifiserte Val Thorens-presetet (kun for verifisert
 *    Val Thorens-tur).
 *  - `mergeDestinationIntoConfig` er merge-bevarende: alle eksisterende felter
 *    i `destination_config` (discovery, webcams, weather, live-data og ukjente
 *    legacy-felter) beholdes uendret.
 *  - Legacy top-level URL-felter (`trailMapUrl`, `weatherUrl`, `avalancheUrl`,
 *    `webcamsUrl`) slettes ALDRI. De kan speiles til canonical
 *    `officialLinks` i den eksplisitte preset-draften.
 */
import { VAL_THORENS_2027 } from "@/config/trip";
import { isValThorensTrip } from "@/features/destination/resolveDestination";
import type { Trip } from "@/hooks/useActiveTrip";

export interface DestinationDraft {
  timezone: string;
  currency: string;
  /** Tekstfelt slik admin skriver dem — valideres før lagring. */
  lat: string;
  lon: string;
  elevation: string;
  zoom: string;
}

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

export const EMPTY_DESTINATION_DRAFT: DestinationDraft = {
  timezone: "",
  currency: "",
  lat: "",
  lon: "",
  elevation: "",
  zoom: "",
};

function numOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || !/^[A-Za-z][A-Za-z0-9+_\-/]{2,}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidCurrency(code: string): boolean {
  return /^[A-Za-z]{3}$/.test(code);
}

/** Leser en draft ut av en eksisterende tur. Ingen gjetting/fallback. */
export function destinationDraftFromTrip(
  trip: Pick<Trip, "timezone" | "currency" | "destination_config"> | null | undefined,
): DestinationDraft {
  if (!trip) return { ...EMPTY_DESTINATION_DRAFT };
  const cfg = (trip.destination_config ?? {}) as Record<string, unknown>;
  const center = (cfg.center ?? {}) as Record<string, unknown>;
  const lat = numOrNull(center.lat);
  const lon = numOrNull(center.lon);
  const elevation = numOrNull(center.elevation);
  const zoom = numOrNull(cfg.zoom);
  return {
    timezone: trip.timezone ?? "",
    currency: trip.currency ?? "",
    lat: lat == null ? "" : String(lat),
    lon: lon == null ? "" : String(lon),
    elevation: elevation == null ? "" : String(elevation),
    zoom: zoom == null ? "" : String(zoom),
  };
}

export interface ParsedDestination {
  timezone: string;
  currency: string;
  center: { lat: number; lon: number; elevation?: number };
  zoom: number | null;
}

/**
 * Validerer og parser draften. Returnerer enten en feilmelding eller de
 * ferdig parsede verdiene.
 */
export type ParsedDestinationResult =
  | { error: string; value: null }
  | { error: null; value: ParsedDestination };

export function parseDestinationDraft(draft: DestinationDraft): ParsedDestinationResult {
  const timezone = draft.timezone.trim();
  const currency = draft.currency.trim().toUpperCase();
  if (!isValidTimezone(timezone)) return { value: null, error: "Ugyldig tidssone (bruk IANA, f.eks. Europe/Paris)" };
  if (!isValidCurrency(currency)) return { value: null, error: "Valuta må være en ISO-kode på tre bokstaver" };

  const lat = numOrNull(draft.lat);
  const lon = numOrNull(draft.lon);
  if (lat == null || lon == null) return { value: null, error: "Senter må ha både breddegrad og lengdegrad" };
  if (lat < -90 || lat > 90) return { value: null, error: "Breddegrad må være mellom -90 og 90" };
  if (lon < -180 || lon > 180) return { value: null, error: "Lengdegrad må være mellom -180 og 180" };

  const center: ParsedDestination["center"] = { lat, lon };
  if (draft.elevation.trim() !== "") {
    const elevation = numOrNull(draft.elevation);
    if (elevation == null || elevation < -500 || elevation > 9000)
      return { value: null, error: "Høyde må være et tall mellom -500 og 9000 meter" };
    center.elevation = elevation;
  }

  let zoom: number | null = null;
  if (draft.zoom.trim() !== "") {
    const z = numOrNull(draft.zoom);
    if (z == null || z < MIN_ZOOM || z > MAX_ZOOM)
      return { value: null, error: `Zoom må være mellom ${MIN_ZOOM} og ${MAX_ZOOM}` };
    zoom = z;
  }

  return { error: null, value: { timezone, currency, center, zoom } };
}

/** Merge-bevarende skriving av senter/zoom inn i eksisterende config. */
export function mergeDestinationIntoConfig(
  existing: Record<string, unknown> | null | undefined,
  parsed: ParsedDestination,
): Record<string, unknown> {
  const base = { ...(existing ?? {}) };
  const prevCenter =
    base.center && typeof base.center === "object" && !Array.isArray(base.center)
      ? (base.center as Record<string, unknown>)
      : {};
  const center: Record<string, unknown> = { ...prevCenter, lat: parsed.center.lat, lon: parsed.center.lon };
  if (parsed.center.elevation != null) center.elevation = parsed.center.elevation;
  base.center = center;
  if (parsed.zoom != null) base.zoom = parsed.zoom;
  return base;
}

/**
 * Verifisert Val Thorens-preset. Returnerer `null` for enhver annen
 * destinasjon, så preset-knappen aldri vises eller kan brukes der.
 */
export function valThorensDestinationPreset(
  trip: Pick<Trip, "id" | "destination"> | null | undefined,
): DestinationDraft | null {
  if (!trip || !isValThorensTrip(trip)) return null;
  const c = VAL_THORENS_2027.center;
  return {
    timezone: VAL_THORENS_2027.timezone,
    currency: VAL_THORENS_2027.currency,
    lat: String(c.lat),
    lon: String(c.lon),
    elevation: c.elevation == null ? "" : String(c.elevation),
    zoom: "13",
  };
}

/**
 * Runtime-felter (peaks + canonical officialLinks) fra det verifiserte
 * Val Thorens-presetet. Legacy top-level URL-felter bevares uendret og brukes
 * som kilde der de finnes. Kun for verifisert Val Thorens-tur.
 */
export function valThorensRuntimePatch(
  trip: Pick<Trip, "id" | "destination"> | null | undefined,
  existing: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!trip || !isValThorensTrip(trip)) return null;
  const base = { ...(existing ?? {}) };
  const legacy = (key: string) => (typeof base[key] === "string" ? (base[key] as string) : undefined);

  const preset = VAL_THORENS_2027.officialLinks;
  const prevLinks =
    base.officialLinks && typeof base.officialLinks === "object" && !Array.isArray(base.officialLinks)
      ? (base.officialLinks as Record<string, unknown>)
      : {};

  const link = (id: string, title: string, url?: string) =>
    url ? { id, title, url, embeddable: false } : undefined;

  base.officialLinks = {
    ...preset,
    ...prevLinks,
    trailMap: link("trail-map", preset.trailMap?.title ?? "Offisielt løypekart", legacy("trailMapUrl")) ?? prevLinks.trailMap ?? preset.trailMap,
    weather: link("weather", preset.weather?.title ?? "Fjellvær", legacy("weatherUrl")) ?? prevLinks.weather ?? preset.weather,
    avalanche: link("avalanche", preset.avalanche?.title ?? "Skredvarsel", legacy("avalancheUrl")) ?? prevLinks.avalanche ?? preset.avalanche,
    webcams: link("webcams", preset.webcams?.title ?? "Alle webkameraer", legacy("webcamsUrl")) ?? prevLinks.webcams ?? preset.webcams,
  };

  if (!Array.isArray(base.peaks) || base.peaks.length === 0) {
    base.peaks = VAL_THORENS_2027.peaks.map((p) => ({ ...p }));
  }
  if (!Array.isArray(base.emergency) || base.emergency.length === 0) {
    base.emergency = VAL_THORENS_2027.emergency.map((g) => ({ ...g }));
  }
  return base;
}
