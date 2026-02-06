/**
 * Dual-source weather service (Yr + MeteoSwiss)
 * Calls edge functions and returns normalized data
 */


import { DAVOS, MOUNTAIN_AREAS, type LocationPoint } from "@/config/locations";

// ============================================
// TYPES
// ============================================

export interface WeatherNow {
  temp: number;
  wind: number;
  windDir: number;
  precip1h: number;
  weatherCode: number;
  updatedAt: string;
}

export interface WeatherDaily {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  snow: number;
  wind: number;
  windDir: number;
  windGust?: number;
  weatherCode: number;
}

export interface WeatherHourly {
  time: string;
  temp: number;
  wind: number;
  windDir: number;
  precip: number;
  weatherCode: number;
}

export interface SourceForecast {
  source: string;
  sourceName: string;
  updatedAt: string;
  now: WeatherNow;
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
}

export interface DualWeatherData {
  location: LocationPoint;
  yr: SourceForecast | null;
  meteoswiss: SourceForecast | null;
  fetchedAt: number;
}

export interface MountainForecast {
  mountain: LocationPoint;
  yr: SourceForecast | null;
  meteoswiss: SourceForecast | null;
}

export interface FullWeatherData {
  davos: DualWeatherData;
  mountains: MountainForecast[];
  fetchedAt: number;
}

// ============================================
// CACHE (localStorage for UI pref only — short TTL)
// ============================================

const CACHE_KEY = "weather-dual-cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached(): FullWeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCache(data: FullWeatherData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function clearDualWeatherCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* */ }
}

// ============================================
// FETCH HELPERS
// ============================================

async function fetchSource(
  fnName: string,
  lat: number,
  lon: number
): Promise<SourceForecast | null> {
  try {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const response = await fetch(
      `${baseUrl}/functions/v1/${fnName}?lat=${lat}&lon=${lon}`,
      {
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
      }
    );

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn(`Failed to fetch ${fnName}:`, err);
    return null;
  }
}

async function fetchForLocation(loc: LocationPoint): Promise<DualWeatherData> {
  const [yr, meteoswiss] = await Promise.all([
    fetchSource("weather-yr", loc.lat, loc.lon),
    fetchSource("weather-meteoswiss", loc.lat, loc.lon),
  ]);

  return {
    location: loc,
    yr,
    meteoswiss,
    fetchedAt: Date.now(),
  };
}

// ============================================
// MAIN SERVICE
// ============================================

export async function getDualWeather(forceRefresh = false): Promise<FullWeatherData> {
  if (!forceRefresh) {
    const cached = getCached();
    if (cached) return cached;
  }

  // Fetch Davos + all mountains in parallel
  const [davos, ...mountainResults] = await Promise.all([
    fetchForLocation(DAVOS),
    ...MOUNTAIN_AREAS.map((m) => fetchForLocation(m)),
  ]);

  const mountains: MountainForecast[] = mountainResults.map((result, i) => ({
    mountain: MOUNTAIN_AREAS[i],
    yr: result.yr,
    meteoswiss: result.meteoswiss,
  }));

  const fullData: FullWeatherData = {
    davos,
    mountains,
    fetchedAt: Date.now(),
  };

  setCache(fullData);
  return fullData;
}

// ============================================
// WEATHER ICONS (WMO codes)
// ============================================

export function getWeatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 49) return "🌫️";
  if (code <= 59) return "🌧️";
  if (code <= 69) return "🌨️";
  if (code <= 79) return "❄️";
  if (code <= 86) return "🌨️";
  if (code === 95) return "⛈️";
  if (code >= 96) return "⛈️";
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
