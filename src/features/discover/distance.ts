/**
 * Personlig avstand i Oppdag.
 *
 * Kontrakt:
 *  - Avstand beregnes LOKALT fra den innloggede brukerens egen ferske
 *    posisjon (LocationSharingContext). Andre brukeres posisjon leses aldri.
 *  - Ingen gjetting: mangler/stale posisjon → null og en ærlig UI-melding.
 *  - Avstand påvirker aldri kandidatsett, Gütta-match eller rekkefølge.
 */
import { STALE_LOCATION_MS } from "@/hooks/useUserLocations";

export interface LatLon {
  lat: number;
  lon: number;
}

export const DISTANCE_UNAVAILABLE_TEXT = "Del eller oppdater posisjon for å se avstand";

export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface OwnPositionState {
  position: LatLon | null;
  /** ms-timestamp for når posisjonen ble hentet. */
  updatedAt: number | null;
  enabled: boolean;
}

/** Returnerer meter, eller null når vi ikke har lov til å påstå noe. */
export function personalDistanceMeters(
  own: OwnPositionState,
  place: LatLon,
  now: number = Date.now(),
): number | null {
  if (!own.enabled || !own.position) return null;
  if (own.updatedAt == null || Number.isNaN(own.updatedAt)) return null;
  if (now - own.updatedAt >= STALE_LOCATION_MS) return null;
  return haversineMeters(own.position, place);
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return DISTANCE_UNAVAILABLE_TEXT;
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 9500 ? 1 : 0)} km`;
}
