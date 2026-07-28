/**
 * useTripWeather — vær for VALGT tur (TripContext), aldri hardkodet destinasjon.
 *
 * Kontrakt:
 *  - Koordinater/timezone kommer fra `resolveDestination(selectedTrip)`.
 *  - Cache-nøkkel er turspesifikk (`trip-weather-<tripId>`).
 *  - Generation-guard: resultat fra tur A settes aldri etter bytte til tur B.
 *  - Mangler config → `unavailable: true` og ingen nettverkskall.
 */
import * as React from "react";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";
import { fetchWeatherAt, type TripWeather } from "@/services/tripWeather";

const FRESH_MS = 15 * 60 * 1000; // 15 min
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 t

interface CacheEnvelope {
  savedAt: number;
  data: TripWeather;
}

export function weatherCacheKey(tripId: string): string {
  return `trip-weather-${tripId}`;
}

function readCache(tripId: string): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(weatherCacheKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.data || Date.now() - parsed.savedAt > STALE_LIMIT_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(tripId: string, data: TripWeather) {
  try {
    localStorage.setItem(weatherCacheKey(tripId), JSON.stringify({ savedAt: Date.now(), data }));
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
  const center = dest.center;
  const unavailable = Boolean(selectedTripId) && !center;

  const [weather, setWeather] = React.useState<TripWeather | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  /** Øker ved hver tur-/kjøring-endring; forkaster utdaterte svar. */
  const generation = React.useRef(0);

  React.useEffect(() => {
    generation.current += 1;
    const myGen = generation.current;
    const tripId = selectedTripId;
    const ac = new AbortController();

    if (!tripId || !center) {
      setWeather(null);
      setLoading(false);
      setError(null);
      return () => ac.abort();
    }

    const cached = readCache(tripId);
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
        lat: center.lat,
        lon: center.lon,
        timezone: dest.timezone ?? "UTC",
        label: dest.destination,
      },
      ac.signal,
    )
      .then((data) => {
        if (generation.current !== myGen) return; // tur byttet – forkast
        writeCache(tripId, data);
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
  }, [tick, selectedTripId, center?.lat, center?.lon, dest.timezone]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);
  return { weather, loading, error, unavailable, refresh };
}
