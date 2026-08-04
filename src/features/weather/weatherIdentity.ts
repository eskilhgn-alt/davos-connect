/**
 * weatherIdentity — deterministisk, konfigurasjonsspesifikk identitet for
 * værdata.
 *
 * Kontrakt:
 *  - Identiteten omfatter valgt trip_id OG den faktisk brukte konfigurasjonen
 *    (senter lat/lon, tidssone og destinasjonsetikett). Endres konfigurasjonen
 *    (v1 → v2) får vi en NY nøkkel, slik at v2 aldri leser v1-cache.
 *  - Nøkkelen er ren og testbar: samme input → samme nøkkel, uansett rekkefølge
 *    på render eller nettverk.
 *  - Mangler koordinater → `null` (ingen nettverkskall, ingen cache).
 */
import type { DestinationRuntime } from "@/features/destination/resolveDestination";

export interface WeatherIdentity {
  key: string;
  tripId: string;
  lat: number;
  lon: number;
  timezone: string;
  label: string;
}

/** Fast presisjon slik at flyttallsstøy ikke lager nye nøkler. */
function coord(n: number): string {
  return n.toFixed(4);
}

export function buildWeatherIdentity(
  tripId: string | null | undefined,
  dest: Pick<DestinationRuntime, "center" | "timezone" | "destination">,
): WeatherIdentity | null {
  if (!tripId || !dest?.center) return null;
  const lat = dest.center.lat;
  const lon = dest.center.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const timezone = dest.timezone ?? "UTC";
  const label = dest.destination ?? "";
  return {
    key: `trip-weather:v2:${tripId}:${coord(lat)},${coord(lon)}:${timezone}:${label}`,
    tripId,
    lat,
    lon,
    timezone,
    label,
  };
}

/** Cache-nøkkel i localStorage for en gitt væridentitet. */
export function weatherCacheKey(identity: WeatherIdentity): string {
  return identity.key;
}

/** True når to identiteter peker på nøyaktig samme tur+konfigurasjon. */
export function sameWeatherIdentity(
  a: WeatherIdentity | null,
  b: WeatherIdentity | null,
): boolean {
  return !!a && !!b && a.key === b.key;
}
