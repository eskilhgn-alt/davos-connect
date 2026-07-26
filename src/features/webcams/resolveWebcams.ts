/**
 * resolveWebcams — leser webkamerakonfigurasjon for valgt tur.
 *
 * Kontrakt:
 *  - Primærkilde er `trip.destination_config.webcams` (Array<TripWebcamRef>).
 *  - Val Thorens-fallbacken brukes KUN når turen faktisk er Val Thorens
 *    (matchet på destination / id) og config-arrayet mangler eller er tomt.
 *    Aldri for en annen destinasjon.
 */
import { VAL_THORENS_2027, type TripWebcamRef } from "@/config/trip";
import type { Trip } from "@/hooks/useActiveTrip";

function isTripWebcam(x: unknown): x is TripWebcamRef {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.externalUrl === "string";
}

function isValThorens(trip: Pick<Trip, "id" | "destination">): boolean {
  const dest = (trip.destination ?? "").toLowerCase();
  return dest.includes("val thorens") || /val[-_]?thorens/i.test(trip.id);
}

export function resolveWebcams(trip: Pick<Trip, "id" | "destination" | "destination_config"> | null): TripWebcamRef[] {
  if (!trip) return [];
  const cfg = trip.destination_config as Record<string, unknown> | null | undefined;
  const raw = cfg && Array.isArray(cfg.webcams) ? (cfg.webcams as unknown[]) : [];
  const cams = raw.filter(isTripWebcam);
  if (cams.length > 0) return cams;
  if (isValThorens(trip)) return VAL_THORENS_2027.webcams;
  return [];
}
