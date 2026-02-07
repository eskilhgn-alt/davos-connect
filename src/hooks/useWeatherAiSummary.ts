/**
 * Hook to fetch AI weather summary from the weather-ai-summary edge function.
 * Uses stale-while-revalidate: shows cached data instantly, refreshes in background.
 * Supports global prefetch so data starts loading before components mount.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WeatherAiWeather {
  temp: number | null;
  tempMin: number | null;
  tempMax: number | null;
  wind: number | null;
  windDir: number;
  weatherCode: number;
  precip: number;
  snow: number;
}

export interface WeatherAiSummary {
  todaySummary: string;
  tomorrowSummary: string;
  sourceComparison: string;
  skiConditions: string;
  confidence: "high" | "medium" | "low";
  confidenceReason?: string;
  generatedAt: string;
  cached?: boolean;
  weather?: WeatherAiWeather | null;
}

interface UseWeatherAiSummaryOptions {
  lat?: number;
  lon?: number;
}

const CACHE_PREFIX = "weather-ai-summary-cache";
const CACHE_TTL = 15 * 60 * 1000; // 15 min

function cacheKey(lat?: number, lon?: number) {
  return lat != null && lon != null ? `${CACHE_PREFIX}-${lat}-${lon}` : `${CACHE_PREFIX}-davos`;
}

function readCache(key: string): WeatherAiSummary | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      // Return cached data even if stale (for instant display)
      return cached.data as WeatherAiSummary;
    }
  } catch { /* ignore */ }
  return null;
}

function isCacheFresh(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      return Date.now() - cached._ts < CACHE_TTL;
    }
  } catch { /* ignore */ }
  return false;
}

// Global in-flight promise to avoid duplicate requests
let globalFetchPromise: Promise<WeatherAiSummary | null> | null = null;
let globalFetchKey: string | null = null;

async function fetchAiSummary(lat?: number, lon?: number, signal?: AbortSignal): Promise<WeatherAiSummary | null> {
  const key = cacheKey(lat, lon);

  // Deduplicate: reuse in-flight request for same key
  if (globalFetchPromise && globalFetchKey === key) {
    return globalFetchPromise;
  }

  const doFetch = async (): Promise<WeatherAiSummary | null> => {
    try {
      const queryParams = new URLSearchParams();
      if (lat != null && lon != null) {
        queryParams.set("lat", String(lat));
        queryParams.set("lon", String(lon));
      }
      const fnPath = queryParams.toString()
        ? `weather-ai-summary?${queryParams.toString()}`
        : "weather-ai-summary";

      const { data, error } = await supabase.functions.invoke(fnPath);

      if (signal?.aborted) return null;
      if (error) throw error;
      if (!data) throw new Error("No data");

      const summary = data as WeatherAiSummary;

      // Cache locally
      try {
        localStorage.setItem(key, JSON.stringify({ _ts: Date.now(), data: summary }));
      } catch { /* ignore */ }

      return summary;
    } catch (err) {
      if (signal?.aborted) return null;
      console.warn("AI weather summary failed:", err);
      return null;
    } finally {
      if (globalFetchKey === key) {
        globalFetchPromise = null;
        globalFetchKey = null;
      }
    }
  };

  globalFetchPromise = doFetch();
  globalFetchKey = key;
  return globalFetchPromise;
}

/**
 * Call this early (e.g. in App.tsx) to start fetching before home screen mounts.
 */
export function prefetchWeatherAiSummary() {
  const key = cacheKey();
  if (!isCacheFresh(key)) {
    fetchAiSummary();
  }
}

export function useWeatherAiSummary(options?: UseWeatherAiSummaryOptions) {
  const lat = options?.lat;
  const lon = options?.lon;

  const key = cacheKey(lat, lon);
  const cachedData = readCache(key);

  const [summary, setSummary] = useState<WeatherAiSummary | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // Show cached data immediately (stale-while-revalidate)
    const cached = readCache(key);
    if (cached) {
      setSummary(cached);
      setLoading(false);
    }

    // If cache is fresh, don't refetch
    if (isCacheFresh(key)) {
      return () => ac.abort();
    }

    // Fetch in background
    if (!cached) setLoading(true);

    fetchAiSummary(lat, lon, ac.signal).then((data) => {
      if (ac.signal.aborted) return;
      if (data) {
        setSummary(data);
        setError(null);
      } else if (!cached) {
        setError("Kunne ikke laste AI-vurdering");
      }
      setLoading(false);
    });

    return () => ac.abort();
  }, [lat, lon, key]);

  return { summary, loading, error };
}
