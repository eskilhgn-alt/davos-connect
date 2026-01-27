// src/features/weather/kiWeatherQuote.ts

import type { DayAggregate } from "@/services/weather.service";
import { ANCHORMAN_QUOTES, ALLOWED_SPEAKERS, type QuoteCategory, type AnchormanQuote } from "./anchormanQuotes";

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
 * Validate that a speaker is in the allowlist
 */
function isAllowedSpeaker(speaker: string): boolean {
  return ALLOWED_SPEAKERS.includes(speaker as typeof ALLOWED_SPEAKERS[number]);
}

/**
 * Filter quotes to only include allowed speakers
 */
function getValidQuotes(category: QuoteCategory): AnchormanQuote[] {
  return ANCHORMAN_QUOTES[category].filter(q => isAllowedSpeaker(q.speaker));
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
 * Only returns quotes from allowed speakers
 */
export function getKiWeatherQuote(
  day?: DayAggregate,
  now?: Date
): { category: QuoteCategory; quote: string; speaker: string } {
  // Default fallback quote (always valid)
  const defaultQuote = {
    category: "sun_bluebird" as QuoteCategory,
    quote: "You stay classy, San Diego.",
    speaker: "Ron Burgundy",
  };

  // Fallback for missing day
  if (!day) {
    return defaultQuote;
  }

  const category = classifyDay(day, now);
  const validQuotes = getValidQuotes(category);

  // If no valid quotes in category, fallback to sun_bluebird
  if (validQuotes.length === 0) {
    const fallbackQuotes = getValidQuotes("sun_bluebird");
    if (fallbackQuotes.length === 0) {
      return defaultQuote;
    }
    const seed = `${day.date}-sun_bluebird`;
    const hash = hashString(seed);
    const index = hash % fallbackQuotes.length;
    const selected = fallbackQuotes[index];
    return {
      category: "sun_bluebird",
      quote: selected.quote,
      speaker: selected.speaker,
    };
  }

  // Deterministic selection based on date + category
  const seed = `${day.date}-${category}`;
  const hash = hashString(seed);
  const index = hash % validQuotes.length;

  const selected = validQuotes[index];

  return {
    category,
    quote: selected.quote,
    speaker: selected.speaker,
  };
}
