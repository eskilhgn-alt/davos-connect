/**
 * useTripWeather — vær for VALGT tur (TripContext), aldri hardkodet destinasjon.
 *
 * Kontrakt:
 *  - Identiteten er konfigurasjonsspesifikk, ikke bare trip_id: den bygges av
 *    `buildWeatherIdentity(tripId, resolveDestination(selectedTrip))` og
 *    inkluderer senter lat/lon, tidssone og destinasjonsetikett.
 *  - Samme tur med config v1 → v2 gir NY cache-nøkkel: v2 leser aldri v1-cache.
 *  - Et forsinket v1-nettverkssvar skal aldri skrive v1-data inn i v2-cache
 *    eller UI: både generation-guard og identitetssjekk håndhever dette.
 *  - AbortController avbryter pågående kall ved identitetsendring/unmount.
 *  - Mangler config → `unavailable: true` og ingen nettverkskall.
 */
import * as React from "react";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";
import {
  buildWeatherIdentity,
  weatherCacheKey,
  type WeatherIdentity,
} from "@/features/weather/weatherIdentity";
import { fetchWeatherAt, type TripWeather } from "@/services/tripWeather";

const FRESH_MS = 15 * 60 * 1000; // 15 min
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 t

interface CacheEnvelope {
  savedAt: number;
  data: TripWeather;
}

export { weatherCacheKey, buildWeatherIdentity };
export type { WeatherIdentity };

function readCache(key: string): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.data || Date.now() - parsed.savedAt > STALE_LIMIT_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: TripWeather) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

export interface UseTripWeatherResult {
  weather: TripWeather | null;
  loading: boolean;
  error: string | null;
  /** Valgt tur mangler koordinater/config for vær. */
  unavailable: boolean;
  refresh: () => void;
}

export function useTripWeather(): UseTripWeatherResult {
  const { selectedTrip, selectedTripId } = useTrip();
  const dest = React.useMemo(() => resolveDestination(selectedTrip), [selectedTrip]);
  const identity = React.useMemo(
    () => buildWeatherIdentity(selectedTripId, dest),
    [selectedTripId, dest],
  );
  const identityKey = identity?.key ?? null;
  const unavailable = Boolean(selectedTripId) && !identity;

  const [weather, setWeather] = React.useState<TripWeather | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  /** Øker ved hver identitets-/kjøringsendring; forkaster utdaterte svar. */
  const generation = React.useRef(0);
  /** Identiteten som gjelder nå — brukes til å avvise gamle svar. */
  const currentIdentity = React.useRef<string | null>(null);

  React.useEffect(() => {
    generation.current += 1;
    const myGen = generation.current;
    const myIdentity = identity;
    currentIdentity.current = identityKey;
    const ac = new AbortController();

    if (!myIdentity) {
      setWeather(null);
      setLoading(false);
      setError(null);
      return () => ac.abort();
    }

    const cacheKey = weatherCacheKey(myIdentity);
    const cached = readCache(cacheKey);
    setWeather(cached?.data ?? null);
    setError(null);

    const fresh = cached && Date.now() - cached.savedAt < FRESH_MS;
    if (fresh && tick === 0) {
      setLoading(false);
      return () => ac.abort();
    }

    setLoading(!cached);

    fetchWeatherAt(
      {
        lat: myIdentity.lat,
        lon: myIdentity.lon,
        timezone: myIdentity.timezone,
        label: myIdentity.label,
      },
      ac.signal,
    )
      .then((data) => {
        // Både generasjon og identitet må stemme: et v1-svar kan aldri
        // skrives inn i v2-cache eller v2-UI.
        if (generation.current !== myGen) return;
        if (currentIdentity.current !== myIdentity.key) return;
        writeCache(cacheKey, data);
        setWeather(data);
        setError(null);
      })
      .catch((err) => {
        if (generation.current !== myGen || ac.signal.aborted) return;
        console.warn("[tripWeather] failed", err);
        if (!cached) setError("Kunne ikke laste vær");
      })
      .finally(() => {
        if (generation.current === myGen) setLoading(false);
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, identityKey]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);
  return { weather, loading, error, unavailable, refresh };
}
