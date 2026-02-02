/**
 * Weather Backend Service
 * Fetches cached weather data from Supabase Edge Functions
 * Falls back to direct Open-Meteo if backend is unavailable
 */

import { supabase } from "@/integrations/supabase/client";
import type { DayAggregate, AggregatedWeather, DayForecast } from "./weather.service";
import { getAggregatedWeather as getDirectWeather } from "./weather.service";

// ============================================
// TYPES
// ============================================

interface BackendConsensusDay {
  date: string;
  tempMax: number;
  tempMin: number;
  tempMedian: number;
  precipitation: number;
  snowfall: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  windLabel: string;
  windCompass: string;
  weatherCode: number;
  confidence: "high" | "medium" | "low";
}

interface BackendQuote {
  quote: string;
  speaker: string;
  category: string;
}

interface BackendMountainPayload {
  mountain: {
    id: string;
    name: string;
    elevation?: number;
  };
  generatedAt: string;
  consensus: {
    daily: BackendConsensusDay[];
    hourly: unknown[];
  };
  models: Record<string, { daily: unknown[]; hourly: unknown[] }>;
  weights: Record<string, number>;
  confidence: "high" | "medium" | "low";
  quote: BackendQuote;
  aiSummary: string | null;
}

interface BackendResponse {
  mountains: Array<{
    mountainId: string;
    stale: boolean;
    generatedAt: string;
  } & BackendMountainPayload>;
  davos: {
    region: string;
    generatedAt: string;
    todaySummary: BackendConsensusDay;
    quote: BackendQuote;
  } | null;
  stale: boolean;
  fetchedAt: string;
}

export interface WeatherWithQuote extends AggregatedWeather {
  quote?: BackendQuote;
  aiSummary?: string | null;
  isFromBackend: boolean;
}

// ============================================
// CACHE
// ============================================

const BACKEND_CACHE_KEY = "weather-backend-cache";
const BACKEND_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (backend refreshes every 15 min)

interface BackendCacheData {
  timestamp: number;
  data: WeatherWithQuote;
}

function getBackendCache(): WeatherWithQuote | null {
  try {
    const cached = localStorage.getItem(BACKEND_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: BackendCacheData = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    if (age > BACKEND_CACHE_DURATION) {
      localStorage.removeItem(BACKEND_CACHE_KEY);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

function setBackendCache(data: WeatherWithQuote): void {
  try {
    const cacheData: BackendCacheData = {
      timestamp: Date.now(),
      data
    };
    localStorage.setItem(BACKEND_CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    // Ignore cache write failures
  }
}

export function clearBackendWeatherCache(): void {
  try {
    localStorage.removeItem(BACKEND_CACHE_KEY);
  } catch {
    // Ignore
  }
}

// ============================================
// TRANSFORM FUNCTIONS
// ============================================

function backendDayToDayAggregate(day: BackendConsensusDay): DayAggregate {
  return {
    date: day.date,
    tempMedian: Math.round(day.tempMedian),
    tempMin: Math.round(day.tempMin),
    tempMax: Math.round(day.tempMax),
    precipMedian: day.precipitation,
    snowMedian: day.snowfall,
    windMedian: Math.round(day.windSpeed),
    windDirectionDeg: day.windDirection,
    windGustMax: Math.round(day.windGust),
    weatherCode: day.weatherCode,
    confidence: day.confidence,
  };
}

function transformBackendResponse(response: BackendResponse): WeatherWithQuote {
  const mountains: Record<string, DayAggregate[]> = {};
  const models: Record<string, Record<string, DayForecast[]>> = {};
  let davos: DayAggregate[] = [];
  let quote: BackendQuote | undefined;
  let aiSummary: string | null = null;

  // Process each mountain
  for (const m of response.mountains) {
    if (!m.consensus?.daily) continue;

    const mountainId = m.mountain?.id || m.mountainId;
    
    // Transform daily consensus to DayAggregate
    mountains[mountainId] = m.consensus.daily.map(backendDayToDayAggregate);

    // Transform models
    if (m.models) {
      for (const [modelName, modelData] of Object.entries(m.models)) {
        if (!models[modelName]) {
          models[modelName] = {};
        }
        if (modelData?.daily) {
          models[modelName][mountainId] = (modelData.daily as Array<{
            date: string;
            temperatureMax: number;
            temperatureMin: number;
            precipitation: number;
            snowfall: number;
            windSpeed: number;
            windGust: number;
            windDirection: number;
            weatherCode: number;
          }>).map(d => ({
            date: d.date,
            temperature: (d.temperatureMax + d.temperatureMin) / 2,
            temperatureMax: d.temperatureMax,
            temperatureMin: d.temperatureMin,
            precipitation: d.precipitation,
            snowfall: d.snowfall,
            wind: d.windSpeed,
            windDirection: d.windDirection,
            windGust: d.windGust,
            weatherCode: d.weatherCode,
          }));
        }
      }
    }

    // Get quote and AI summary from first mountain
    if (!quote && m.quote) {
      quote = m.quote;
    }
    if (aiSummary === null && m.aiSummary) {
      aiSummary = m.aiSummary;
    }
  }

  // Create Davos aggregate from first mountain or davos summary
  if (response.mountains.length > 0 && response.mountains[0].consensus?.daily) {
    davos = response.mountains[0].consensus.daily.map(backendDayToDayAggregate);
  }

  return {
    davos,
    mountains,
    models,
    fetchedAt: Date.now(),
    quote,
    aiSummary,
    isFromBackend: true,
  };
}

// ============================================
// MAIN SERVICE
// ============================================

export async function getBackendWeather(days: number = 7): Promise<WeatherWithQuote> {
  // Check cache first
  const cached = getBackendCache();
  if (cached) {
    return cached;
  }

  try {
    // Call the Edge Function
    const { data, error } = await supabase.functions.invoke<BackendResponse>(
      "weather-engine-get",
      {
        body: null,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (error) {
      console.warn("Backend weather fetch failed:", error);
      throw error;
    }

    if (!data || !data.mountains || data.mountains.length === 0) {
      console.warn("Backend returned no data, falling back to direct fetch");
      throw new Error("No backend data");
    }

    const result = transformBackendResponse(data);
    setBackendCache(result);
    return result;

  } catch (err) {
    console.warn("Falling back to direct Open-Meteo fetch:", err);
    
    // Fallback to direct Open-Meteo
    const directData = await getDirectWeather(days);
    return {
      ...directData,
      isFromBackend: false,
    };
  }
}

/**
 * Trigger a manual refresh of the backend cache
 * This requires CRON_SECRET which users don't have, so it's mainly for testing
 */
export async function triggerBackendRefresh(cronSecret: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-engine-refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}
