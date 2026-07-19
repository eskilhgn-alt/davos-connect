/**
 * Hook for aktiv turs vær (Open-Meteo, ingen API-nøkkel).
 * Stale-while-revalidate via localStorage – én sentral cache uansett kaller.
 */
import * as React from "react";
import { ACTIVE_TRIP } from "@/config/trip";
import {
  fetchTripWeather,
  type TripWeather,
} from "@/services/tripWeather";

const CACHE_KEY = `trip-weather-${ACTIVE_TRIP.id}`;
const FRESH_MS = 15 * 60 * 1000; // 15 min
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 t

interface CacheEnvelope {
  savedAt: number;
  data: TripWeather;
}

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (Date.now() - parsed.savedAt > STALE_LIMIT_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: TripWeather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

let inflight: Promise<TripWeather> | null = null;

export interface UseTripWeatherResult {
  weather: TripWeather | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTripWeather(): UseTripWeatherResult {
  const initial = readCache();
  const [weather, setWeather] = React.useState<TripWeather | null>(initial?.data ?? null);
  const [loading, setLoading] = React.useState<boolean>(!initial);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const cached = readCache();
    const fresh = cached && Date.now() - cached.savedAt < FRESH_MS;
    if (cached && !weather) setWeather(cached.data);
    if (fresh && tick === 0) {
      setLoading(false);
      return () => ac.abort();
    }

    if (!cached) setLoading(true);

    const promise = inflight ?? fetchTripWeather(ACTIVE_TRIP, ac.signal);
    inflight = promise;

    promise
      .then((data) => {
        if (cancelled) return;
        writeCache(data);
        setWeather(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled || ac.signal.aborted) return;
        console.warn("[tripWeather] failed", err);
        if (!cached) setError("Kunne ikke laste vær");
      })
      .finally(() => {
        if (inflight === promise) inflight = null;
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);
  return { weather, loading, error, refresh };
}
