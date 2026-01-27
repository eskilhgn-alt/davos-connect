// src/features/weather/kiWeatherQuote.ts

import type { DayAggregate } from "@/services/weather.service";
import { ANCHORMAN_QUOTES, type QuoteCategory, type AnchormanQuote } from "./anchormanQuotes";

export type { QuoteCategory };

// Weather codes reference (WMO)
const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const THUNDER_CODES = [95, 96, 99];
const FOG_CODES = [45, 48];
const CLEAR_CODES = [0, 1, 2, 3];

/**
 * Simple string hash for deterministic quote selection
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Classify the day's weather into a quote category
 */
export function classifyDay(day: DayAggregate, now?: Date): QuoteCategory {
  const { tempMin, tempMax, precipMedian, snowMedian, windMedian, weatherCode } = day;
  const currentHour = (now || new Date()).getHours();

  // Priority order matters - check most specific/severe conditions first

  // 1. Powder / new snow (exciting!)
  if (snowMedian >= 6 || SNOW_CODES.includes(weatherCode)) {
    return "powder_new_snow";
  }

  // 2. Storm / wind (dangerous/dramatic)
  if (THUNDER_CODES.includes(weatherCode) || windMedian >= 14 || precipMedian >= 8) {
    return "storm_wind";
  }

  // 3. Whiteout / fog / flat light
  if (FOG_CODES.includes(weatherCode) || (snowMedian >= 3 && windMedian >= 10)) {
    return "whiteout_fog_flatlight";
  }

  // 4. Cold snap (extreme cold)
  if (tempMin <= -15) {
    return "cold_snap";
  }

  // 5. Spring slush / hot
  if (tempMax >= 8 && snowMedian <= 0.5) {
    return "spring_slush_hot";
  }

  // 6. Ice / hardpack (cold but no new snow)
  if (tempMax <= 1 && snowMedian <= 0.5 && precipMedian <= 0.5) {
    return "ice_hardpack";
  }

  // 7. Sun / bluebird (nice conditions)
  if (CLEAR_CODES.includes(weatherCode) && precipMedian <= 0.3 && windMedian <= 8) {
    // Check for après time (after 15:00)
    if (currentHour >= 15) {
      return "apres";
    }
    return "sun_bluebird";
  }

  // 8. Après fallback for mild evenings
  if (currentHour >= 15 && tempMax >= 0 && windMedian <= 10) {
    return "apres";
  }

  // Default fallback
  return "sun_bluebird";
}

/**
 * Get a deterministic quote based on day and category
 * Same day + same category = same quote (stable across re-renders)
 */
export function getKiWeatherQuote(
  day?: DayAggregate,
  now?: Date
): { category: QuoteCategory; quote: string; speaker: string } {
  // Fallback for missing day
  if (!day) {
    const fallback = ANCHORMAN_QUOTES.sun_bluebird[0];
    return {
      category: "sun_bluebird",
      quote: fallback.quote,
      speaker: fallback.speaker,
    };
  }

  const category = classifyDay(day, now);
  const quotes = ANCHORMAN_QUOTES[category];

  // Deterministic selection based on date + category
  const seed = `${day.date}-${category}`;
  const hash = hashString(seed);
  const index = hash % quotes.length;

  const selected = quotes[index];

  return {
    category,
    quote: selected.quote,
    speaker: selected.speaker,
  };
}
