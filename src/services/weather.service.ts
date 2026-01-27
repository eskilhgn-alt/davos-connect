/**
 * Weather Service for Davos Multi-Model Consensus
 * Fetches from Open-Meteo API across multiple weather models
 * Aggregates data with median/min/max calculations
 */

import { MOUNTAINS, type Mountain } from "@/config/mountains";

// ============================================
// TYPES
// ============================================

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DayForecast {
  date: string;
  temperature: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitation: number;
  snowfall: number;
  wind: number;
  weatherCode: number;
}

export interface DayAggregate {
  date: string;
  tempMedian: number;
  tempMin: number;
  tempMax: number;
  precipMedian: number;
  snowMedian: number;
  windMedian: number;
  weatherCode: number;
  confidence: ConfidenceLevel;
}

export interface AggregatedWeather {
  davos: DayAggregate[];
  mountains: Record<string, DayAggregate[]>;
  models: Record<string, Record<string, DayForecast[]>>;
  fetchedAt: number;
}

// ============================================
// WEATHER MODELS
// ============================================

export const WEATHER_MODELS = [
  { id: "ecmwf_ifs025", name: "ECMWF" },
  { id: "gfs_seamless", name: "GFS" },
  { id: "icon_seamless", name: "ICON" },
  { id: "gem_seamless", name: "GEM" }
] as const;

export type ModelId = typeof WEATHER_MODELS[number]["id"];

// ============================================
// CACHE
// ============================================

const CACHE_KEY = "weather-cache";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface CacheData {
  timestamp: number;
  data: AggregatedWeather;
}

function getCache(): AggregatedWeather | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CacheData = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    if (age > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

function setCache(data: AggregatedWeather): void {
  try {
    const cacheData: CacheData = {
      timestamp: Date.now(),
      data
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch {
    // Ignore cache write failures
  }
}

// ============================================
// OPEN-METEO API
// ============================================

interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    snowfall_sum: number[];
    wind_speed_10m_max: number[];
    weather_code: number[];
  };
}

async function fetchModelForecast(
  mountain: Mountain,
  modelId: ModelId,
  days: number
): Promise<DayForecast[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", mountain.lat.toString());
  url.searchParams.set("longitude", mountain.lon.toString());
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,weather_code");
  url.searchParams.set("models", modelId);
  url.searchParams.set("forecast_days", days.toString());
  url.searchParams.set("timezone", "Europe/Zurich");

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${modelId} for ${mountain.name}`);
  }

  const data: OpenMeteoResponse = await response.json();
  
  return data.daily.time.map((date, i) => ({
    date,
    temperature: (data.daily.temperature_2m_max[i] + data.daily.temperature_2m_min[i]) / 2,
    temperatureMax: data.daily.temperature_2m_max[i],
    temperatureMin: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i] || 0,
    snowfall: data.daily.snowfall_sum[i] || 0,
    wind: data.daily.wind_speed_10m_max[i] || 0,
    weatherCode: data.daily.weather_code[i] || 0
  }));
}

// ============================================
// AGGREGATION HELPERS
// ============================================

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateConfidence(tempSpan: number): ConfidenceLevel {
  if (tempSpan <= 2) return "high";
  if (tempSpan <= 5) return "medium";
  return "low";
}

function aggregateForecasts(
  forecasts: DayForecast[][],
  dayCount: number
): DayAggregate[] {
  const result: DayAggregate[] = [];
  
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const dayData = forecasts
      .map(f => f[dayIndex])
      .filter(Boolean);
    
    if (dayData.length === 0) continue;
    
    const temps = dayData.map(d => d.temperature);
    const tempMaxes = dayData.map(d => d.temperatureMax);
    const tempMins = dayData.map(d => d.temperatureMin);
    const precips = dayData.map(d => d.precipitation);
    const snows = dayData.map(d => d.snowfall);
    const winds = dayData.map(d => d.wind);
    
    const tempMin = Math.min(...tempMins);
    const tempMax = Math.max(...tempMaxes);
    const tempSpan = tempMax - tempMin;
    
    result.push({
      date: dayData[0].date,
      tempMedian: Math.round(median(temps)),
      tempMin: Math.round(tempMin),
      tempMax: Math.round(tempMax),
      precipMedian: Math.round(median(precips) * 10) / 10,
      snowMedian: Math.round(median(snows) * 10) / 10,
      windMedian: Math.round(median(winds)),
      weatherCode: dayData[0].weatherCode,
      confidence: calculateConfidence(tempSpan)
    });
  }
  
  return result;
}

// ============================================
// MAIN SERVICE
// ============================================

export async function getAggregatedWeather(days: number = 7): Promise<AggregatedWeather> {
  // Check cache first
  const cached = getCache();
  if (cached) {
    return cached;
  }
  
  // Fetch all data in parallel
  const modelData: Record<string, Record<string, DayForecast[]>> = {};
  const mountainForecasts: Record<string, DayForecast[][]> = {};
  
  // Initialize structures
  for (const model of WEATHER_MODELS) {
    modelData[model.name] = {};
  }
  for (const mountain of MOUNTAINS) {
    mountainForecasts[mountain.id] = [];
  }
  
  // Fetch all combinations
  const fetchPromises: Promise<void>[] = [];
  
  for (const mountain of MOUNTAINS) {
    for (const model of WEATHER_MODELS) {
      fetchPromises.push(
        fetchModelForecast(mountain, model.id, days)
          .then(forecast => {
            modelData[model.name][mountain.id] = forecast;
            mountainForecasts[mountain.id].push(forecast);
          })
          .catch(error => {
            console.warn(`Failed to fetch ${model.name} for ${mountain.name}:`, error);
          })
      );
    }
  }
  
  await Promise.all(fetchPromises);
  
  // Aggregate per mountain
  const mountains: Record<string, DayAggregate[]> = {};
  for (const mountain of MOUNTAINS) {
    const forecasts = mountainForecasts[mountain.id];
    if (forecasts.length > 0) {
      mountains[mountain.id] = aggregateForecasts(forecasts, days);
    }
  }
  
  // Aggregate for Davos (all mountains combined)
  const allForecasts = Object.values(mountainForecasts).flat();
  const davos = aggregateForecasts(allForecasts, days);
  
  const result: AggregatedWeather = {
    davos,
    mountains,
    models: modelData,
    fetchedAt: Date.now()
  };
  
  // Cache the result
  setCache(result);
  
  return result;
}

// ============================================
// WEATHER CODE TO ICON MAPPING
// ============================================

export function getWeatherIcon(code: number): string {
  // WMO Weather interpretation codes
  // https://open-meteo.com/en/docs
  if (code === 0) return "☀️"; // Clear sky
  if (code <= 3) return "⛅"; // Partly cloudy
  if (code <= 49) return "🌫️"; // Fog
  if (code <= 59) return "🌧️"; // Drizzle
  if (code <= 69) return "🌨️"; // Rain
  if (code <= 79) return "❄️"; // Snow
  if (code <= 84) return "🌨️"; // Rain showers
  if (code <= 86) return "🌨️"; // Snow showers
  if (code === 95) return "⛈️"; // Thunderstorm
  if (code >= 96) return "⛈️"; // Thunderstorm with hail
  return "☁️";
}

export function getWeatherDescription(code: number): string {
  if (code === 0) return "Klart";
  if (code <= 3) return "Delvis skyet";
  if (code <= 49) return "Tåke";
  if (code <= 59) return "Yr";
  if (code <= 69) return "Regn";
  if (code <= 79) return "Snø";
  if (code <= 86) return "Snøbyger";
  if (code >= 95) return "Tordenvær";
  return "Overskyet";
}
