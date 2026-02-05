/**
 * Weather Engine Refresh - Cron-triggered Edge Function
 * Fetches Open-Meteo forecasts for all mountains, computes consensus with dynamic weighting
 * Uses Lovable AI Gateway for AI summaries (today + tomorrow)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ============================================
// TYPES
// ============================================

interface Mountain {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation?: number;
}

interface DayForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitation: number;
  snowfall: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  weatherCode: number;
  cloudCover?: number;
}

interface HourlyForecast {
  time: string;
  temperature: number;
  precipitation: number;
  snowfall: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
}

interface ModelForecast {
  modelId: string;
  modelName: string;
  daily: DayForecast[];
  hourly: HourlyForecast[];
}

interface ObservedWeather {
  temp_max: number;
  temp_min: number;
  precipitation: number;
  wind_speed: number;
}

type QuoteCategory =
  | "sun_bluebird"
  | "powder_new_snow"
  | "storm_wind"
  | "whiteout_fog_flatlight"
  | "cold_snap"
  | "spring_slush_hot"
  | "ice_hardpack"
  | "apres";

interface AnchormanQuote {
  quote: string;
  speaker: string;
  use: string;
}

// ============================================
// CONFIGURATION
// ============================================

const MOUNTAINS: Mountain[] = [
  { id: "parsenn", name: "Parsenn", lat: 46.83, lon: 9.80, elevation: 2844 },
  { id: "jakobshorn", name: "Jakobshorn", lat: 46.77, lon: 9.85, elevation: 2590 },
  { id: "pischa", name: "Pischa", lat: 46.85, lon: 9.90, elevation: 2483 },
  { id: "rinerhorn", name: "Rinerhorn", lat: 46.74, lon: 9.77, elevation: 2490 },
  { id: "madrisa", name: "Madrisa", lat: 46.93, lon: 9.86, elevation: 2602 }
];

// Davos coordinates for observed weather
const DAVOS_LAT = 46.80;
const DAVOS_LON = 9.83;

const WEATHER_MODELS = [
  { id: "ecmwf_ifs025", name: "ECMWF" },
  { id: "gfs_seamless", name: "GFS" },
  { id: "icon_seamless", name: "ICON" },
  { id: "gem_seamless", name: "GEM" }
] as const;

const BASE_WEIGHTS: Record<string, number> = {
  ecmwf_ifs025: 0.40,
  gfs_seamless: 0.20,
  icon_seamless: 0.25,
  gem_seamless: 0.15
};

const ALLOWED_SPEAKERS = [
  "Ron Burgundy",
  "Brian Fantana",
  "Champ Kind",
  "Brick Tamland",
  "Veronica Corningstone",
  "Ed Harken",
  "Arturo Mendez"
];

// Quote bank - embedded for Edge Function
const ANCHORMAN_QUOTES: Record<QuoteCategory, AnchormanQuote[]> = {
  sun_bluebird: [
    { quote: "San Diego. Drink it in. It always goes down smooth.", speaker: "Ron Burgundy", use: "perfekt sol/bluebird" },
    { quote: "By the beard of Zeus!", speaker: "Ron Burgundy", use: "sol + hype" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy", use: "klassisk 'alt sitter'" },
    { quote: "I don't know how to put this, but I'm kind of a big deal.", speaker: "Ron Burgundy", use: "sol + selvtillit" },
    { quote: "I have many leather-bound books, and my apartment smells of rich mahogany.", speaker: "Ron Burgundy", use: "bluebird = unødvendig luksus" },
    { quote: "Super duper, gang! Super duper!", speaker: "Ron Burgundy", use: "sol = alt er super" },
  ],
  powder_new_snow: [
    { quote: "Cannonball!", speaker: "Ron Burgundy", use: "send det i nysnø" },
    { quote: "Panda Watch! The mood is tense.", speaker: "Brian Fantana", use: "førstespor-stemning" },
    { quote: "It's so fluffy I'm gonna die!", speaker: "Ron Burgundy", use: "episk pudder" },
    { quote: "Great Odin's raven!", speaker: "Ron Burgundy", use: "snøfall + wow" },
  ],
  storm_wind: [
    { quote: "Boy, that escalated quickly.", speaker: "Ron Burgundy", use: "vær som går fra 0 til 100" },
    { quote: "I mean, that really got out of hand fast!", speaker: "Ron Burgundy", use: "storm + kaos" },
    { quote: "It jumped up a notch.", speaker: "Champ Kind", use: "vinden tar over" },
    { quote: "There were horses and a man on fire...", speaker: "Brick Tamland", use: "ren storm-fantasi" },
    { quote: "The sewers run red with Burgundy's blood.", speaker: "Arturo Mendez", use: "overdrevent stormdrama" },
  ],
  whiteout_fog_flatlight: [
    { quote: "I'm in a glass case of emotion!", speaker: "Ron Burgundy", use: "whiteout-panikk (humor)" },
    { quote: "I don't know what we're yelling about!", speaker: "Brick Tamland", use: "flatlys-forvirring" },
    { quote: "Loud noises!", speaker: "Brick Tamland", use: "tåke + stress" },
    { quote: "Agree to disagree.", speaker: "Ron Burgundy", use: "når fjellet nekter samarbeid" },
    { quote: "That doesn't make any sense.", speaker: "Ron Burgundy", use: "når sikten er 'nei'" },
    { quote: "I'm Ron Burgundy?", speaker: "Ron Burgundy", use: "når alt blir usikkert" },
  ],
  cold_snap: [
    { quote: "Mm, I love scotch. I love Scotch. Scotchy, Scotch, Scotch.", speaker: "Ron Burgundy", use: "sprengkulde = varm drikke-vibb" },
    { quote: "Here it goes down. Down into my belly.", speaker: "Ron Burgundy", use: "kulde = trøst" },
    { quote: "It's quite pungent.", speaker: "Ron Burgundy", use: "kul luft som 'stinger'" },
    { quote: "It stings the nostrils.", speaker: "Ron Burgundy", use: "iskald luft" },
    { quote: "In a good way.", speaker: "Ron Burgundy", use: "kulde men bra dag" },
    { quote: "60% of the time, it works every time.", speaker: "Brian Fantana", use: "selvtillit i kulda" },
  ],
  spring_slush_hot: [
    { quote: "It's so damn hot... milk was a bad choice!", speaker: "Ron Burgundy", use: "vårslush / varmegrader" },
    { quote: "Milk was a bad choice.", speaker: "Ron Burgundy", use: "kort versjon" },
    { quote: "I'm expressing my inner anguish THROUGH THE MAJESTY OF SONG!", speaker: "Ron Burgundy", use: "slush = dramatikk" },
    { quote: "Neat-o, gang.", speaker: "Ron Burgundy", use: "lett vårstemning" },
    { quote: "Super duper!", speaker: "Ron Burgundy", use: "sol + slush-humør" },
  ],
  ice_hardpack: [
    { quote: "Keep your head on a swivel.", speaker: "Ron Burgundy", use: "isføre = skjerp deg" },
    { quote: "That's bush. Bush league.", speaker: "Ron Burgundy", use: "hardpack = 'skjerpings'" },
    { quote: "If you were a man, I would punch you.", speaker: "Ron Burgundy", use: "isføre = aggressiv edge-energi" },
    { quote: "It's terrible!", speaker: "Ron Burgundy", use: "når det er glassføre" },
    { quote: "Big deal. I am very professional.", speaker: "Ron Burgundy", use: "hardpack = 'kjør riktig'" },
    { quote: "Anything you put on that prompter, Burgundy will read!", speaker: "Ed Harken", use: "isføre = alt du gjør får konsekvens" },
  ],
  apres: [
    { quote: "We've been coming to the same party for 12 years now...and in no way is that depressing.", speaker: "Ron Burgundy", use: "klassisk afterski-liv" },
    { quote: "Champ here. I'm all about havin' fun.", speaker: "Champ Kind", use: "après-modus" },
    { quote: "Time to musk up.", speaker: "Brian Fantana", use: "før afterski" },
    { quote: "It stings the nostrils. In a good way.", speaker: "Ron Burgundy", use: "shots/aftershave/après" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy", use: "avslutt kvelden" },
  ],
};

// ============================================
// WIND UTILITIES
// ============================================

function windStrengthLabel(ms: number): string {
  if (ms < 0.3) return "Stille";
  if (ms <= 1.5) return "Flau vind";
  if (ms <= 3.3) return "Svak vind";
  if (ms <= 5.4) return "Lett bris";
  if (ms <= 7.9) return "Laber bris";
  if (ms <= 10.7) return "Frisk bris";
  if (ms <= 13.8) return "Liten kuling";
  if (ms <= 17.1) return "Stiv kuling";
  if (ms <= 20.7) return "Sterk kuling";
  if (ms <= 24.4) return "Liten storm";
  if (ms <= 28.4) return "Full storm";
  if (ms <= 32.6) return "Sterk storm";
  return "Orkan";
}

function windCompass(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "N";
  if (normalized < 67.5) return "NØ";
  if (normalized < 112.5) return "Ø";
  if (normalized < 157.5) return "SØ";
  if (normalized < 202.5) return "S";
  if (normalized < 247.5) return "SV";
  if (normalized < 292.5) return "V";
  return "NV";
}

function circularMeanDegrees(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let meanDeg = (Math.atan2(sinSum / degrees.length, cosSum / degrees.length) * 180) / Math.PI;
  if (meanDeg < 0) meanDeg += 360;
  return Math.round(meanDeg);
}

// ============================================
// OBSERVED WEATHER FETCH
// ============================================

async function fetchYesterdayObserved(): Promise<ObservedWeather | null> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", DAVOS_LAT.toString());
    url.searchParams.set("longitude", DAVOS_LON.toString());
    url.searchParams.set("start_date", dateStr);
    url.searchParams.set("end_date", dateStr);
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max");
    url.searchParams.set("timezone", "Europe/Zurich");
    
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn("Failed to fetch observed weather:", response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
      return null;
    }
    
    return {
      temp_max: data.daily.temperature_2m_max[0],
      temp_min: data.daily.temperature_2m_min[0],
      precipitation: data.daily.precipitation_sum[0] || 0,
      wind_speed: data.daily.wind_speed_10m_max[0] || 0,
    };
  } catch (error) {
    console.warn("Error fetching observed weather:", error);
    return null;
  }
}

// ============================================
// DYNAMIC WEIGHT CALCULATION
// ============================================

interface ModelScore {
  modelId: string;
  tempError: number;
  precipError: number;
  windError: number;
  totalScore: number;
}

function calculateModelScores(
  forecasts: ModelForecast[],
  observed: ObservedWeather
): ModelScore[] {
  const scores: ModelScore[] = [];
  
  for (const forecast of forecasts) {
    // Get yesterday's forecast (first day is today, but we need yesterday's prediction)
    // Since we're comparing with observed, we look at the pattern
    const day = forecast.daily[0]; // Today's forecast
    
    if (!day) continue;
    
    // Simple MAE calculation
    const tempError = Math.abs((day.temperatureMax + day.temperatureMin) / 2 - 
                               (observed.temp_max + observed.temp_min) / 2);
    const precipError = Math.abs(day.precipitation - observed.precipitation);
    const windError = Math.abs(day.windSpeed - observed.wind_speed);
    
    // Combined score (lower is better)
    // Weight temperature more heavily as it's more important for ski conditions
    const totalScore = (tempError * 0.5) + (precipError * 0.3) + (windError * 0.2);
    
    scores.push({
      modelId: forecast.modelId,
      tempError,
      precipError,
      windError,
      totalScore,
    });
  }
  
  return scores;
}

function computeDynamicWeights(
  scores: ModelScore[],
  baseWeights: Record<string, number>
): Record<string, number> {
  if (scores.length === 0) return baseWeights;
  
  // Convert scores to weights (inverse relationship - lower score = higher weight)
  const maxScore = Math.max(...scores.map(s => s.totalScore));
  const inverseScores: Record<string, number> = {};
  
  for (const score of scores) {
    // Inverse and normalize
    inverseScores[score.modelId] = maxScore - score.totalScore + 1; // +1 to avoid zero
  }
  
  const sumInverse = Object.values(inverseScores).reduce((a, b) => a + b, 0);
  
  // Blend with base weights (70% data-driven, 30% base)
  const dynamicWeights: Record<string, number> = {};
  
  for (const score of scores) {
    const dataWeight = inverseScores[score.modelId] / sumInverse;
    const baseWeight = baseWeights[score.modelId] || 0.25;
    dynamicWeights[score.modelId] = (dataWeight * 0.7) + (baseWeight * 0.3);
  }
  
  // Normalize
  const sumWeights = Object.values(dynamicWeights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(dynamicWeights)) {
    dynamicWeights[key] = dynamicWeights[key] / sumWeights;
  }
  
  return dynamicWeights;
}

// ============================================
// OPEN-METEO FETCH
// ============================================

interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    snowfall_sum: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    weather_code: number[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    snowfall: number[];
    weather_code: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
  };
}

async function fetchModelForecast(
  mountain: Mountain,
  modelId: string,
  modelName: string,
  days: number
): Promise<ModelForecast | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", mountain.lat.toString());
    url.searchParams.set("longitude", mountain.lon.toString());
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant");
    url.searchParams.set("hourly", "temperature_2m,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m");
    url.searchParams.set("models", modelId);
    url.searchParams.set("forecast_days", days.toString());
    url.searchParams.set("timezone", "Europe/Zurich");

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(`Failed to fetch ${modelName} for ${mountain.name}: ${response.status}`);
      return null;
    }

    const data: OpenMeteoResponse = await response.json();

    const daily: DayForecast[] = data.daily.time.map((date, i) => ({
      date,
      temperatureMax: data.daily.temperature_2m_max[i],
      temperatureMin: data.daily.temperature_2m_min[i],
      precipitation: data.daily.precipitation_sum[i] || 0,
      snowfall: data.daily.snowfall_sum[i] || 0,
      windSpeed: data.daily.wind_speed_10m_max[i] || 0,
      windGust: data.daily.wind_gusts_10m_max[i] || 0,
      windDirection: data.daily.wind_direction_10m_dominant[i] || 0,
      weatherCode: data.daily.weather_code[i] || 0,
    }));

    const hourly: HourlyForecast[] = data.hourly.time.map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      precipitation: data.hourly.precipitation[i] || 0,
      snowfall: data.hourly.snowfall[i] || 0,
      weatherCode: data.hourly.weather_code[i] || 0,
      cloudCover: data.hourly.cloud_cover[i] || 0,
      windSpeed: data.hourly.wind_speed_10m[i] || 0,
      windDirection: data.hourly.wind_direction_10m[i] || 0,
      windGust: data.hourly.wind_gusts_10m[i] || 0,
    }));

    return { modelId, modelName, daily, hourly };
  } catch (error) {
    console.warn(`Error fetching ${modelName} for ${mountain.name}:`, error);
    return null;
  }
}

// ============================================
// CONSENSUS CALCULATION
// ============================================

interface ConsensusDay {
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
  cloudCover?: number;
}

function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== undefined && !isNaN(values[i])) {
      sum += values[i] * weights[i];
      weightSum += weights[i];
    }
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

function weightedVote(codes: number[], weights: number[]): number {
  const votes: Record<number, number> = {};
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code !== undefined) {
      votes[code] = (votes[code] || 0) + weights[i];
    }
  }
  let maxVote = 0;
  let winner = 0;
  for (const [code, weight] of Object.entries(votes)) {
    if (weight > maxVote) {
      maxVote = weight;
      winner = parseInt(code);
    }
  }
  return winner;
}

function calculateConfidence(tempSpan: number): "high" | "medium" | "low" {
  if (tempSpan <= 2) return "high";
  if (tempSpan <= 5) return "medium";
  return "low";
}

function computeConsensus(
  forecasts: ModelForecast[],
  weights: Record<string, number>
): { daily: ConsensusDay[]; hourly: HourlyForecast[] } {
  if (forecasts.length === 0) {
    return { daily: [], hourly: [] };
  }

  const dayCount = forecasts[0].daily.length;
  const daily: ConsensusDay[] = [];

  // Normalize weights for available models
  const availableWeights: number[] = [];
  for (const f of forecasts) {
    availableWeights.push(weights[f.modelId] || 0.25);
  }
  const weightSum = availableWeights.reduce((a, b) => a + b, 0);
  const normalizedWeights = availableWeights.map(w => w / weightSum);

  for (let d = 0; d < dayCount; d++) {
    const dayData = forecasts.map(f => f.daily[d]).filter(Boolean);
    if (dayData.length === 0) continue;

    const tempMaxes = dayData.map(d => d.temperatureMax);
    const tempMins = dayData.map(d => d.temperatureMin);
    const precips = dayData.map(d => d.precipitation);
    const snows = dayData.map(d => d.snowfall);
    const winds = dayData.map(d => d.windSpeed);
    const gusts = dayData.map(d => d.windGust);
    const dirs = dayData.map(d => d.windDirection);
    const codes = dayData.map(d => d.weatherCode);

    const tempMax = Math.round(weightedAverage(tempMaxes, normalizedWeights) * 10) / 10;
    const tempMin = Math.round(weightedAverage(tempMins, normalizedWeights) * 10) / 10;
    const tempMedian = Math.round((tempMax + tempMin) / 2 * 10) / 10;
    const precipitation = Math.round(weightedAverage(precips, normalizedWeights) * 10) / 10;
    const snowfall = Math.round(weightedAverage(snows, normalizedWeights) * 10) / 10;
    const windSpeedVal = Math.round(weightedAverage(winds, normalizedWeights) * 10) / 10;
    const windGust = Math.round(weightedAverage(gusts, normalizedWeights) * 10) / 10;
    const windDirection = circularMeanDegrees(dirs.filter(d => !isNaN(d)));
    const weatherCode = weightedVote(codes, normalizedWeights);

    const tempSpan = Math.max(...tempMaxes) - Math.min(...tempMins);

    daily.push({
      date: dayData[0].date,
      tempMax,
      tempMin,
      tempMedian,
      precipitation,
      snowfall,
      windSpeed: windSpeedVal,
      windGust,
      windDirection,
      windLabel: windStrengthLabel(windSpeedVal),
      windCompass: windCompass(windDirection),
      weatherCode,
      confidence: calculateConfidence(tempSpan),
    });
  }

  // Consensus hourly
  const hourCount = forecasts[0].hourly.length;
  const hourly: HourlyForecast[] = [];

  for (let h = 0; h < hourCount; h++) {
    const hourData = forecasts.map(f => f.hourly[h]).filter(Boolean);
    if (hourData.length === 0) continue;

    hourly.push({
      time: hourData[0].time,
      temperature: Math.round(weightedAverage(hourData.map(d => d.temperature), normalizedWeights) * 10) / 10,
      precipitation: Math.round(weightedAverage(hourData.map(d => d.precipitation), normalizedWeights) * 100) / 100,
      snowfall: Math.round(weightedAverage(hourData.map(d => d.snowfall), normalizedWeights) * 100) / 100,
      weatherCode: weightedVote(hourData.map(d => d.weatherCode), normalizedWeights),
      cloudCover: Math.round(weightedAverage(hourData.map(d => d.cloudCover), normalizedWeights)),
      windSpeed: Math.round(weightedAverage(hourData.map(d => d.windSpeed), normalizedWeights) * 10) / 10,
      windDirection: circularMeanDegrees(hourData.map(d => d.windDirection).filter(d => !isNaN(d))),
      windGust: Math.round(weightedAverage(hourData.map(d => d.windGust), normalizedWeights) * 10) / 10,
    });
  }

  return { daily, hourly };
}

// ============================================
// QUOTE SELECTION WITH ANTI-REPEAT
// ============================================

const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const THUNDER_CODES = [95, 96, 99];
const FOG_CODES = [45, 48];
const CLEAR_CODES = [0, 1, 2, 3];

function classifyWeather(day: ConsensusDay, cloudCover?: number): QuoteCategory {
  const { tempMin, tempMax, precipitation, snowfall, windSpeed, windGust, weatherCode } = day;
  const currentHour = new Date().getHours();

  if (snowfall >= 8 || (snowfall >= 5 && tempMax <= -2) || SNOW_CODES.includes(weatherCode)) {
    return "powder_new_snow";
  }

  if (THUNDER_CODES.includes(weatherCode) || windGust >= 18 || windSpeed >= 12) {
    return "storm_wind";
  }

  if (FOG_CODES.includes(weatherCode) || (cloudCover && cloudCover > 80 && precipitation > 0)) {
    return "whiteout_fog_flatlight";
  }

  if (tempMin <= -12) {
    return "cold_snap";
  }

  if (tempMax >= 6 && precipitation <= 1) {
    return "spring_slush_hot";
  }

  if (tempMax >= -2 && tempMax <= 2 && snowfall <= 1 && windSpeed <= 8) {
    return "ice_hardpack";
  }

  if (CLEAR_CODES.includes(weatherCode) && precipitation <= 0.3 && windSpeed <= 8) {
    if (currentHour >= 15) {
      return "apres";
    }
    return "sun_bluebird";
  }

  if (currentHour >= 15 && tempMax >= 0 && windSpeed <= 10) {
    return "apres";
  }

  return "sun_bluebird";
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

async function selectQuoteWithAntiRepeat(
  supabase: any,
  mountainId: string,
  date: string,
  category: QuoteCategory
): Promise<{ quote: string; speaker: string; category: QuoteCategory }> {
  const validQuotes = ANCHORMAN_QUOTES[category].filter(q =>
    ALLOWED_SPEAKERS.includes(q.speaker)
  );

  if (validQuotes.length === 0) {
    return {
      quote: "You stay classy, San Diego.",
      speaker: "Ron Burgundy",
      category: "sun_bluebird",
    };
  }

  // Check recently used quotes (last 3 days)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  let recentHashes: Set<string> = new Set();
  try {
    const { data: recentQuotes } = await supabase
      .from("quote_usage")
      .select("quote_hash")
      .gte("used_at", threeDaysAgo.toISOString().split('T')[0]);

    recentHashes = new Set((recentQuotes || []).map((q: { quote_hash: string }) => q.quote_hash));
  } catch {
    // Ignore errors reading quote usage
  }

  // Filter out recently used quotes
  const availableQuotes = validQuotes.filter(q => {
    const hash = hashString(q.quote);
    return !recentHashes.has(hash.toString());
  });

  // If all quotes were used recently, use any valid quote
  const quotesToChooseFrom = availableQuotes.length > 0 ? availableQuotes : validQuotes;

  // Deterministic but varied selection
  const seed = `${mountainId}-${date}-${category}-${new Date().getHours()}`;
  const hash = hashString(seed);
  const index = hash % quotesToChooseFrom.length;
  const selected = quotesToChooseFrom[index];

  // Record usage
  const quoteHash = hashString(selected.quote).toString();
  try {
    await supabase
      .from("quote_usage")
      .upsert({
        quote_hash: quoteHash,
        speaker: selected.speaker,
        category,
        used_at: new Date().toISOString().split('T')[0],
      }, { onConflict: "quote_hash" });
  } catch {
    // Ignore errors writing quote usage
  }

  return {
    quote: selected.quote,
    speaker: selected.speaker,
    category,
  };
}

// ============================================
// AI SUMMARY (Lovable AI Gateway)
// ============================================

interface AiSummaries {
  today: string | null;
  tomorrow: string | null;
}

interface AIForecastObject {
  tempMin: number;
  tempMax: number;
  windSpeed: number;
  windGust: number;
  precipMm: number;
  snowfall: number;
  confidence: string;
  textSummary: string;
}

async function generateAiSummaries(
  mountainName: string,
  today: ConsensusDay,
  tomorrow: ConsensusDay | null,
  modelWeights: Record<string, number>
): Promise<{ summaries: AiSummaries; heroToday: AIForecastObject | null; heroTomorrow: AIForecastObject | null }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  // Fallback to OpenAI if Lovable not available
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  const apiKey = LOVABLE_API_KEY || OPENAI_API_KEY;
  const apiUrl = LOVABLE_API_KEY 
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = LOVABLE_API_KEY ? "google/gemini-2.5-flash" : "gpt-4o-mini";
  
  if (!apiKey) {
    console.warn("No AI API key configured, skipping AI summaries");
    return { 
      summaries: { today: null, tomorrow: null },
      heroToday: null,
      heroTomorrow: null
    };
  }

  try {
    const weightsStr = Object.entries(modelWeights)
      .map(([model, weight]) => `${model.replace('_seamless', '').replace('_ifs025', '').toUpperCase()}: ${Math.round(weight * 100)}%`)
      .join(', ');

    const prompt = `Du er en erfaren skiinstruktør og værekspert i Davos, Sveits. Analyser værdata og gi både tall og tekst tilbake.

FJELL: ${mountainName}

I DAG (${today.date}):
- Temp: ${today.tempMin}° til ${today.tempMax}°C
- Snøfall: ${today.snowfall} cm
- Vind: ${today.windSpeed} m/s (${today.windLabel}) fra ${today.windCompass}, kast ${today.windGust} m/s
- Nedbør: ${today.precipitation} mm
- Modellsikkerhet: ${today.confidence}

${tomorrow ? `I MORGEN (${tomorrow.date}):
- Temp: ${tomorrow.tempMin}° til ${tomorrow.tempMax}°C
- Snøfall: ${tomorrow.snowfall} cm
- Vind: ${tomorrow.windSpeed} m/s (${tomorrow.windLabel}) fra ${tomorrow.windCompass}, kast ${tomorrow.windGust} m/s
- Nedbør: ${tomorrow.precipitation} mm
- Modellsikkerhet: ${tomorrow.confidence}` : 'Ingen data for i morgen.'}

MODELLVEKTER (dynamisk basert på historisk treffsikkerhet): ${weightsStr}

Svar i JSON-format:
{
  "todaySummary": "1-2 setninger med personlig anbefaling for i dag",
  "tomorrowSummary": "1-2 setninger med personlig anbefaling for i morgen",
  "heroToday": {
    "tempMin": <AI-justert min-temp>,
    "tempMax": <AI-justert max-temp>,
    "windSpeed": <AI-justert vindstyrke>,
    "windGust": <AI-justert vindkast>,
    "precipMm": <AI-justert nedbør>,
    "snowfall": <AI-justert snøfall>,
    "confidence": "<high/medium/low>",
    "textSummary": "<kort 5-10 ord oppsummering>"
  },
  "heroTomorrow": {
    "tempMin": <AI-justert min-temp>,
    "tempMax": <AI-justert max-temp>,
    "windSpeed": <AI-justert vindstyrke>,
    "windGust": <AI-justert vindkast>,
    "precipMm": <AI-justert nedbør>,
    "snowfall": <AI-justert snøfall>,
    "confidence": "<high/medium/low>",
    "textSummary": "<kort 5-10 ord oppsummering>"
  }
}

Regler:
- Svar på norsk
- Vær kort og konkret
- Bruk gjerne humor
- Juster tallene basert på din vurdering av modellene
- Fokuser på praktiske skiråd`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.warn("AI API failed:", response.status);
      return { 
        summaries: { today: null, tomorrow: null },
        heroToday: null,
        heroTomorrow: null
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
      return { 
        summaries: { today: null, tomorrow: null },
        heroToday: null,
        heroTomorrow: null
      };
    }

    // Parse JSON response
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      const jsonStr = jsonMatch[1] || content;
      const parsed = JSON.parse(jsonStr);
      
      return {
        summaries: {
          today: parsed.todaySummary || null,
          tomorrow: parsed.tomorrowSummary || null,
        },
        heroToday: parsed.heroToday || null,
        heroTomorrow: parsed.heroTomorrow || null,
      };
    } catch {
      // If not valid JSON, use content as today's summary
      return { 
        summaries: { today: content, tomorrow: null },
        heroToday: null,
        heroTomorrow: null
      };
    }
  } catch (error) {
    console.warn("AI summary error:", error);
    return { 
      summaries: { today: null, tomorrow: null },
      heroToday: null,
      heroTomorrow: null
    };
  }
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (!expectedSecret || cronSecret !== expectedSecret) {
    console.error("Unauthorized: Invalid or missing CRON_SECRET");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch yesterday's observed weather for dynamic weighting
    const observed = await fetchYesterdayObserved();
    console.log("Observed weather:", observed);

    // Store observed data
    if (observed) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await supabase
        .from("weather_observed")
        .upsert({
          location_id: "davos",
          observed_date: yesterday.toISOString().split('T')[0],
          temp_max: observed.temp_max,
          temp_min: observed.temp_min,
          precipitation: observed.precipitation,
          wind_speed: observed.wind_speed,
          source: "open-meteo",
        }, { onConflict: "location_id,observed_date" });
    }

    const results: Record<string, unknown> = {};
    const forecastDays = 10;

    // Process first mountain to get dynamic weights
    const firstMountain = MOUNTAINS[0];
    const initialForecasts = await Promise.all(
      WEATHER_MODELS.map(model => 
        fetchModelForecast(firstMountain, model.id, model.name, forecastDays)
      )
    );
    const validInitialForecasts = initialForecasts.filter((f): f is ModelForecast => f !== null);

    // Calculate dynamic weights if we have observed data
    let dynamicWeights = BASE_WEIGHTS;
    if (observed && validInitialForecasts.length > 0) {
      const scores = calculateModelScores(validInitialForecasts, observed);
      dynamicWeights = computeDynamicWeights(scores, BASE_WEIGHTS);
      console.log("Dynamic weights:", dynamicWeights);
      
      // Store updated weights
      await supabase
        .from("weather_model_weights")
        .upsert({
          mountain_id: "global",
          weights: dynamicWeights,
          updated_at: new Date().toISOString(),
        }, { onConflict: "mountain_id" });
    }

    // Process each mountain with dynamic weights
    for (const mountain of MOUNTAINS) {
      console.log(`Processing ${mountain.name}...`);

      // Fetch all models in parallel (reuse initial forecasts for first mountain)
      const modelResults = mountain.id === firstMountain.id 
        ? validInitialForecasts
        : await Promise.all(
            WEATHER_MODELS.map(model =>
              fetchModelForecast(mountain, model.id, model.name, forecastDays)
            )
          ).then(results => results.filter((f): f is ModelForecast => f !== null));

      if (modelResults.length === 0) {
        console.warn(`No valid forecasts for ${mountain.name}`);
        continue;
      }

      // Compute consensus with dynamic weights
      const consensus = computeConsensus(modelResults, dynamicWeights);

      const today = consensus.daily[0];
      const tomorrow = consensus.daily[1] || null;
      const avgCloudCover = consensus.hourly.slice(0, 24).reduce((sum, h) => sum + h.cloudCover, 0) / 24;

      // Classify weather and select quote with anti-repeat
      const category = classifyWeather(today, avgCloudCover);
      const quote = await selectQuoteWithAntiRepeat(supabase, mountain.id, today.date, category);

      // AI summaries with hero data
      const { summaries: aiSummaries, heroToday, heroTomorrow } = await generateAiSummaries(
        mountain.name, today, tomorrow, dynamicWeights
      );

      // Build payload
      const payload = {
        mountain: {
          id: mountain.id,
          name: mountain.name,
          elevation: mountain.elevation,
        },
        generatedAt: new Date().toISOString(),
        consensus: {
          daily: consensus.daily,
          hourly: consensus.hourly,
        },
        models: Object.fromEntries(
          modelResults.map(f => [f.modelName, { daily: f.daily, hourly: f.hourly }])
        ),
        weights: dynamicWeights,
        confidence: today.confidence,
        quote,
        aiSummary: aiSummaries.today,
        aiSummaryToday: aiSummaries.today,
        aiSummaryTomorrow: aiSummaries.tomorrow,
        heroToday: heroToday || {
          tempMin: today.tempMin,
          tempMax: today.tempMax,
          windSpeed: today.windSpeed,
          windGust: today.windGust,
          precipMm: today.precipitation,
          snowfall: today.snowfall,
          confidence: today.confidence,
          textSummary: `${today.tempMax}° | ${today.windLabel}`,
        },
        heroTomorrow: heroTomorrow || (tomorrow ? {
          tempMin: tomorrow.tempMin,
          tempMax: tomorrow.tempMax,
          windSpeed: tomorrow.windSpeed,
          windGust: tomorrow.windGust,
          precipMm: tomorrow.precipitation,
          snowfall: tomorrow.snowfall,
          confidence: tomorrow.confidence,
          textSummary: `${tomorrow.tempMax}° | ${tomorrow.windLabel}`,
        } : null),
        dataSource: "AI-akkumulert konsensus",
      };

      // Upsert to cache
      const { error: upsertError } = await supabase
        .from("weather_cache")
        .upsert({
          mountain_id: mountain.id,
          generated_at: new Date().toISOString(),
          payload,
        });

      if (upsertError) {
        console.error(`Failed to cache ${mountain.name}:`, upsertError);
      } else {
        console.log(`Cached ${mountain.name} successfully`);
      }

      results[mountain.id] = { success: true, quote: quote.category };
    }

    // Create Davos aggregate entry
    const { data: allCached } = await supabase
      .from("weather_cache")
      .select("payload")
      .in("mountain_id", MOUNTAINS.map(m => m.id));

    if (allCached && allCached.length > 0) {
      const firstPayload = allCached[0].payload as {
        consensus: { daily: ConsensusDay[] };
        quote: { quote: string; speaker: string; category: QuoteCategory };
        aiSummaryToday?: string | null;
        aiSummaryTomorrow?: string | null;
        heroToday?: AIForecastObject;
        heroTomorrow?: AIForecastObject | null;
      };
      const todayConsensus = firstPayload.consensus.daily[0];
      const tomorrowConsensus = firstPayload.consensus.daily[1] || null;
      
      const davosPayload = {
        region: "davos",
        generatedAt: new Date().toISOString(),
        mountains: MOUNTAINS.map(m => m.id),
        todaySummary: todayConsensus,
        tomorrowSummary: tomorrowConsensus,
        quote: firstPayload.quote,
        aiSummaryToday: firstPayload.aiSummaryToday,
        aiSummaryTomorrow: firstPayload.aiSummaryTomorrow,
        heroToday: firstPayload.heroToday,
        heroTomorrow: firstPayload.heroTomorrow,
        dataSource: "AI-akkumulert konsensus",
      };

      await supabase
        .from("weather_cache")
        .upsert({
          mountain_id: "davos",
          generated_at: new Date().toISOString(),
          payload: davosPayload,
        });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        dynamicWeights,
        observedAvailable: !!observed,
        timestamp: new Date().toISOString() 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Weather engine refresh error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
