/**
 * resolveDestination — én testbar kilde for destinasjonsavhengige funksjoner
 * (vær, kart, live-status, sikkerhet) basert på VALGT tur i TripContext.
 *
 * Kontrakt:
 *  - Primærkilde er `trip.destination_config` (senter, zoom, peaks, kart,
 *    live-provider, offisielle lenker, nødkontakter).
 *  - Val Thorens-kodefallback brukes KUN når turen faktisk identifiseres som
 *    Val Thorens (destination/id), på samme måte som webcam-resolveren.
 *    En annen destinasjon skal aldri få Val Thorens-data.
 *  - Mangler nødvendig config → `configured: false` og en ærlig tomtilstand
 *    i UI. Ingen skjult fallback.
 */
import {
  VAL_THORENS_2027,
  type EmergencyGroup,
  type TripConfig,
  type TripCoordinate,
  type TripPeak,
} from "@/config/trip";
import type { Trip } from "@/hooks/useActiveTrip";

export type LiveProvider = "lumiplan" | null;

export interface DestinationMap {
  url: string;
  title: string;
}

export interface DestinationRuntime {
  tripId: string | null;
  destination: string;
  country: string | null;
  timezone: string | null;
  currency: string | null;
  center: TripCoordinate | null;
  zoom: number;
  peaks: TripPeak[];
  pisteMap: DestinationMap | null;
  liveProvider: LiveProvider;
  officialLinks: TripConfig["officialLinks"];
  emergency: EmergencyGroup[];
  /** true når vi har koordinater nok til vær/kart. */
  configured: boolean;
  source: "config" | "val-thorens-fallback" | "none";
}

type TripLike = Pick<
  Trip,
  "id" | "destination" | "country" | "timezone" | "currency" | "destination_config"
>;

export function isValThorensTrip(trip: Pick<Trip, "id" | "destination"> | null): boolean {
  if (!trip) return false;
  const dest = (trip.destination ?? "").toLowerCase();
  return dest.includes("val thorens") || /val[-_]?thorens/i.test(trip.id ?? "");
}

function isCoordinate(x: unknown): x is TripCoordinate {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.lat === "number" && typeof o.lon === "number";
}

function isPeak(x: unknown): x is TripPeak {
  if (!isCoordinate(x)) return false;
  const o = x as unknown as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.elevation === "number";
}

function isMap(x: unknown): x is DestinationMap {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.url === "string" && /^https:\/\//.test(o.url);
}

const EMPTY: DestinationRuntime = {
  tripId: null,
  destination: "",
  country: null,
  timezone: null,
  currency: null,
  center: null,
  zoom: 13,
  peaks: [],
  pisteMap: null,
  liveProvider: null,
  officialLinks: {},
  emergency: [],
  configured: false,
  source: "none",
};

export function resolveDestination(trip: TripLike | null | undefined): DestinationRuntime {
  if (!trip) return EMPTY;

  const cfg = (trip.destination_config ?? {}) as Record<string, unknown>;
  const vt = isValThorensTrip(trip);
  const fb: TripConfig | null = vt ? VAL_THORENS_2027 : null;

  const center = isCoordinate(cfg.center) ? cfg.center : fb?.center ?? null;

  const rawPeaks = Array.isArray(cfg.peaks) ? (cfg.peaks as unknown[]).filter(isPeak) : [];
  const peaks = rawPeaks.length > 0 ? rawPeaks : fb?.peaks ?? [];

  const pisteMap = isMap(cfg.pisteMap)
    ? { url: cfg.pisteMap.url, title: cfg.pisteMap.title ?? "Interaktivt løypekart" }
    : vt
      ? {
          url: "https://lumiplay.link/interactive-map/les-3-vallees/fr",
          title: "Offisielt interaktivt løypekart for Val Thorens og Les 3 Vallées",
        }
      : null;

  const liveProvider: LiveProvider =
    cfg.liveProvider === "lumiplan" ? "lumiplan" : cfg.liveProvider == null && vt ? "lumiplan" : null;

  const officialLinks =
    cfg.officialLinks && typeof cfg.officialLinks === "object"
      ? (cfg.officialLinks as TripConfig["officialLinks"])
      : fb?.officialLinks ?? {};

  const emergency = Array.isArray(cfg.emergency)
    ? (cfg.emergency as EmergencyGroup[])
    : fb?.emergency ?? [];

  const usedFallback =
    vt && !isCoordinate(cfg.center) && rawPeaks.length === 0 && !isMap(cfg.pisteMap);

  return {
    tripId: trip.id ?? null,
    destination: trip.destination ?? fb?.destination ?? "",
    country: trip.country ?? fb?.country ?? null,
    timezone: trip.timezone ?? fb?.timezone ?? null,
    currency: trip.currency ?? fb?.currency ?? null,
    center,
    zoom: typeof cfg.zoom === "number" ? cfg.zoom : 13,
    peaks,
    pisteMap,
    liveProvider,
    officialLinks,
    emergency,
    configured: Boolean(center),
    source: usedFallback ? "val-thorens-fallback" : center || pisteMap ? "config" : "none",
  };
}
