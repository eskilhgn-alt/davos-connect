/**
 * Val Thorens-flow via Open-Meteo (ingen API-nøkkel kreves).
 *
 * All operativ værdata i appen skal hentes herfra, basert på
 * `ACTIVE_TRIP.center` og `ACTIVE_TRIP.timezone` – ingen hardkodede
 * koordinater. Offisielt fjellvær og skredvarsel
 * lenkes til Meteo-France (se `ACTIVE_TRIP.officialLinks.weather`).
 */
import { ACTIVE_TRIP, type TripConfig } from "@/config/trip";

export interface TripCurrentWeather {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  weatherCode: number | null;
  isDay: boolean;
  time: string | null;
}

export interface TripDailyForecast {
  date: string; // YYYY-MM-DD
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  windMaxMs: number | null;
  weatherCode: number | null;
}

export interface TripWeather {
  fetchedAt: string; // ISO
  timezone: string;
  location: { lat: number; lon: number; label: string };
  current: TripCurrentWeather;
  daily: TripDailyForecast[];
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export async function fetchTripWeather(
  trip: TripConfig = ACTIVE_TRIP,
  signal?: AbortSignal,
): Promise<TripWeather> {
  const params = new URLSearchParams({
    latitude: String(trip.center.lat),
    longitude: String(trip.center.lon),
    timezone: trip.timezone,
    wind_speed_unit: "ms",
    current: [
      "temperature_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "snowfall",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "snowfall_sum",
      "wind_speed_10m_max",
    ].join(","),
    forecast_days: "7",
  });

  const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Open-Meteo svarte med ${res.status}`);
  }
  const json = await res.json();

  const c = json.current ?? {};
  const d = json.daily ?? {};
  const times: string[] = Array.isArray(d.time) ? d.time : [];

  const daily: TripDailyForecast[] = times.map((date, i) => ({
    date,
    tempMaxC: d.temperature_2m_max?.[i] ?? null,
    tempMinC: d.temperature_2m_min?.[i] ?? null,
    precipitationMm: d.precipitation_sum?.[i] ?? null,
    snowfallCm: d.snowfall_sum?.[i] ?? null,
    windMaxMs: d.wind_speed_10m_max?.[i] ?? null,
    weatherCode: d.weather_code?.[i] ?? null,
  }));

  return {
    fetchedAt: new Date().toISOString(),
    timezone: json.timezone ?? trip.timezone,
    location: { lat: trip.center.lat, lon: trip.center.lon, label: trip.destination },
    current: {
      temperatureC: c.temperature_2m ?? null,
      apparentTemperatureC: c.apparent_temperature ?? null,
      windSpeedMs: c.wind_speed_10m ?? null,
      windDirectionDeg: c.wind_direction_10m ?? null,
      precipitationMm: c.precipitation ?? null,
      snowfallCm: c.snowfall ?? null,
      weatherCode: c.weather_code ?? null,
      isDay: c.is_day === 1 || c.is_day === true,
      time: c.time ?? null,
    },
    daily,
  };
}

// -- WMO weather codes -----------------------------------------------------

export interface WeatherCodeInfo {
  label: string;
  icon: "sun" | "cloud" | "cloud-rain" | "cloud-snow" | "cloud-drizzle" | "cloud-fog" | "cloud-lightning";
}

export function describeWeatherCode(code: number | null | undefined): WeatherCodeInfo {
  if (code == null) return { label: "Ukjent", icon: "cloud" };
  if (code === 0) return { label: "Klarvær", icon: "sun" };
  if (code === 1 || code === 2) return { label: "Delvis skyet", icon: "cloud" };
  if (code === 3) return { label: "Overskyet", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Tåke", icon: "cloud-fog" };
  if (code >= 51 && code <= 57) return { label: "Yr", icon: "cloud-drizzle" };
  if (code >= 61 && code <= 67) return { label: "Regn", icon: "cloud-rain" };
  if (code >= 71 && code <= 77) return { label: "Snø", icon: "cloud-snow" };
  if (code >= 80 && code <= 82) return { label: "Regnbyger", icon: "cloud-rain" };
  if (code >= 85 && code <= 86) return { label: "Snøbyger", icon: "cloud-snow" };
  if (code >= 95) return { label: "Torden", icon: "cloud-lightning" };
  return { label: "Skyet", icon: "cloud" };
}
