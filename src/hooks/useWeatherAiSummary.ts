/**
 * Hook to fetch AI weather summary from the weather-ai-summary edge function
 */
import { useState, useEffect } from "react";
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

const CACHE_KEY = "weather-ai-summary-cache";
const CACHE_TTL = 15 * 60 * 1000; // 15 min

export function useWeatherAiSummary() {
  const [summary, setSummary] = useState<WeatherAiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      // Check localStorage cache
      try {
        const raw = localStorage.getItem(CACHE_KEY);
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
        const { data, error: fnError } = await supabase.functions.invoke(
          "weather-ai-summary"
        );

        if (fnError) throw fnError;
        if (!data) throw new Error("No data");

        setSummary(data as WeatherAiSummary);
        
        // Cache locally
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ _ts: Date.now(), data })
          );
        } catch { /* ignore */ }
      } catch (err) {
        console.warn("AI weather summary failed:", err);
        setError("Kunne ikke laste AI-vurdering");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { summary, loading, error };
}
