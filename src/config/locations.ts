/**
 * Location points derived from the central trip config.
 * Kept as a stable module path for backward compatibility with existing
 * weather/services imports. Do NOT hard-code destination coordinates here —
 * edit `src/config/trip.ts` instead.
 */
import { ACTIVE_TRIP } from "./trip";

export interface LocationPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation?: number;
}

/** Map/weather anchor for the active trip. */
export const TRIP_CENTER: LocationPoint = {
  id: ACTIVE_TRIP.id,
  name: ACTIVE_TRIP.destination,
  lat: ACTIVE_TRIP.center.lat,
  lon: ACTIVE_TRIP.center.lon,
  elevation: ACTIVE_TRIP.center.elevation,
};

export const MOUNTAIN_AREAS: LocationPoint[] = ACTIVE_TRIP.peaks.map((p) => ({
  id: p.id,
  name: p.name,
  lat: p.lat,
  lon: p.lon,
  elevation: p.elevation,
}));
