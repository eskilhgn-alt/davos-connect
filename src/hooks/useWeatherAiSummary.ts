/**
 * Hook to fetch AI weather summary from the weather-ai-summary edge function.
 * Supports location-aware queries — re-fetches when lat/lon changes.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WeatherAiSummary {
  todaySummary: string;
  tomorrowSummary: string;
  sourceComparison: string;
  skiConditions: string;
  confidence: "high" | "medium" | "low";
  confidenceReason?: string;
  generatedAt: string;
  cached?: boolean;
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

export function useWeatherAiSummary(options?: UseWeatherAiSummaryOptions) {
  const lat = options?.lat;
  const lon = options?.lon;
  const [summary, setSummary] = useState<WeatherAiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const load = async () => {
      setSummary(null);
      setLoading(true);
      setError(null);

      const key = cacheKey(lat, lon);

      // Check localStorage cache
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const cached = JSON.parse(raw);
          if (Date.now() - cached._ts < CACHE_TTL) {
            setSummary(cached.data);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore */ }

      try {
        const body: Record<string, unknown> = {};
        // Pass lat/lon as query params via the body (supabase functions.invoke sends body as POST)
        const queryParams = new URLSearchParams();
        if (lat != null && lon != null) {
          queryParams.set("lat", String(lat));
          queryParams.set("lon", String(lon));
        }
        const fnPath = queryParams.toString()
          ? `weather-ai-summary?${queryParams.toString()}`
          : "weather-ai-summary";

        const { data, error: fnError } = await supabase.functions.invoke(fnPath);

        if (ac.signal.aborted) return;
        if (fnError) throw fnError;
        if (!data) throw new Error("No data");

        setSummary(data as WeatherAiSummary);

        // Cache locally
        try {
          localStorage.setItem(key, JSON.stringify({ _ts: Date.now(), data }));
        } catch { /* ignore */ }
      } catch (err) {
        if (ac.signal.aborted) return;
        console.warn("AI weather summary failed:", err);
        setError("Kunne ikke laste AI-vurdering");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => ac.abort();
  }, [lat, lon]);

  return { summary, loading, error };
}
