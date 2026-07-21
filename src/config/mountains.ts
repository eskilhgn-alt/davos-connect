/**
 * Mountain list for weather aggregation.
 * Derived from the central trip config (`src/config/trip.ts`).
 */
import { ACTIVE_TRIP } from "./trip";

export interface Mountain {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation?: number;
}

export const MOUNTAINS: Mountain[] = ACTIVE_TRIP.peaks.map((p) => ({
  id: p.id,
  name: p.name,
  lat: p.lat,
  lon: p.lon,
  elevation: p.elevation,
}));

/** Map center for the active trip. */
export const TRIP_CENTER = {
  lat: ACTIVE_TRIP.center.lat,
  lon: ACTIVE_TRIP.center.lon,
};
