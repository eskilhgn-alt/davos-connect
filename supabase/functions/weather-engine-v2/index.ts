/**
 * Weather Engine V2 - Unified Refresh & Get Endpoint
 * 
 * Features:
 * - Fetches from 5 sources: ECMWF, GFS, ICON, GEM, Yr.no
 * - Historical scoring based on observed data
 * - Dynamic weighting with 7-day rolling window
 * - AI-aggregated consensus via Lovable AI Gateway
 * - Anti-repeat quote selection
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ============================================
// TYPES
// ============================================

interface Location {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation_m: number | null;
}

interface DayPayload {
  date: string;
  temperatureMin: number;
  temperatureMax: number;
  precipitationMm: number;
  snowfallCm: number;
  windMs: number;
  windGustMs: number;
  windDirectionDeg: number;
  weatherCode: number;
}

interface SourceForecast {
  sourceId: string;
  locationId: string;
  daily: DayPayload[];
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

interface Quote {
  quote: string;
  speaker: string;
  category: QuoteCategory;
}

// ============================================
// CONFIGURATION
// ============================================

const OPEN_METEO_MODELS: Record<string, string> = {
  ecmwf: "ecmwf_ifs025",
  gfs: "gfs_seamless",
  icon: "icon_seamless",
  gem: "gem_seamless",
};

const BASE_WEIGHTS: Record<string, number> = {
  ecmwf: 0.30,
  gfs: 0.18,
  icon: 0.22,
  gem: 0.15,
  yr: 0.15,
};

const ALLOWED_SPEAKERS = [
  "Ron Burgundy",
  "Brian Fantana",
  "Champ Kind",
  "Brick Tamland",
  "Veronica Corningstone",
  "Ed Harken",
  "Arturo Mendez",
] as const;

// Quote bank - only valid speakers
const ANCHORMAN_QUOTES: Record<QuoteCategory, { quote: string; speaker: string }[]> = {
  sun_bluebird: [
    { quote: "San Diego. Drink it in. It always goes down smooth.", speaker: "Ron Burgundy" },
    { quote: "By the beard of Zeus!", speaker: "Ron Burgundy" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy" },
    { quote: "I don't know how to put this, but I'm kind of a big deal.", speaker: "Ron Burgundy" },
    { quote: "Super duper, gang! Super duper!", speaker: "Ron Burgundy" },
    { quote: "I have many leather-bound books, and my apartment smells of rich mahogany.", speaker: "Ron Burgundy" },
  ],
  powder_new_snow: [
    { quote: "Cannonball!", speaker: "Ron Burgundy" },
    { quote: "Panda Watch! The mood is tense.", speaker: "Brian Fantana" },
    { quote: "Great Odin's raven!", speaker: "Ron Burgundy" },
    { quote: "There were horses and a man on fire...", speaker: "Brick Tamland" },
    { quote: "60% of the time, it works every time.", speaker: "Brian Fantana" },
  ],
  storm_wind: [
    { quote: "Boy, that escalated quickly.", speaker: "Ron Burgundy" },
    { quote: "I mean, that really got out of hand fast!", speaker: "Ron Burgundy" },
    { quote: "It jumped up a notch.", speaker: "Champ Kind" },
    { quote: "There were horses and a man on fire...", speaker: "Brick Tamland" },
    { quote: "The sewers run red with Burgundy's blood.", speaker: "Arturo Mendez" },
  ],
  whiteout_fog_flatlight: [
    { quote: "I'm in a glass case of emotion!", speaker: "Ron Burgundy" },
    { quote: "I don't know what we're yelling about!", speaker: "Brick Tamland" },
    { quote: "Loud noises!", speaker: "Brick Tamland" },
    { quote: "Agree to disagree.", speaker: "Ron Burgundy" },
    { quote: "That doesn't make any sense.", speaker: "Ron Burgundy" },
    { quote: "I'm Ron Burgundy?", speaker: "Ron Burgundy" },
  ],
  cold_snap: [
    { quote: "Mm, I love scotch. I love Scotch. Scotchy, Scotch, Scotch.", speaker: "Ron Burgundy" },
    { quote: "Here it goes down. Down into my belly.", speaker: "Ron Burgundy" },
    { quote: "It's quite pungent.", speaker: "Ron Burgundy" },
    { quote: "It stings the nostrils.", speaker: "Ron Burgundy" },
    { quote: "In a good way.", speaker: "Ron Burgundy" },
    { quote: "60% of the time, it works every time.", speaker: "Brian Fantana" },
  ],
  spring_slush_hot: [
    { quote: "It's so damn hot... milk was a bad choice!", speaker: "Ron Burgundy" },
    { quote: "Milk was a bad choice.", speaker: "Ron Burgundy" },
    { quote: "Neat-o, gang.", speaker: "Ron Burgundy" },
    { quote: "Super duper!", speaker: "Ron Burgundy" },
    { quote: "I'm expressing my inner anguish THROUGH THE MAJESTY OF SONG!", speaker: "Ron Burgundy" },
  ],
  ice_hardpack: [
    { quote: "Keep your head on a swivel.", speaker: "Ron Burgundy" },
    { quote: "That's bush. Bush league.", speaker: "Ron Burgundy" },
    { quote: "If you were a man, I would punch you.", speaker: "Ron Burgundy" },
    { quote: "It's terrible!", speaker: "Ron Burgundy" },
    { quote: "Big deal. I am very professional.", speaker: "Ron Burgundy" },
    { quote: "Anything you put on that prompter, Burgundy will read!", speaker: "Ed Harken" },
  ],
  apres: [
    { quote: "We've been coming to the same party for 12 years now...and in no way is that depressing.", speaker: "Ron Burgundy" },
    { quote: "Champ here. I'm all about havin' fun.", speaker: "Champ Kind" },
    { quote: "Time to musk up.", speaker: "Brian Fantana" },
    { quote: "It stings the nostrils. In a good way.", speaker: "Ron Burgundy" },
    { quote: "You stay classy, San Diego.", speaker: "Ron Burgundy" },
  ],
};

// ============================================
// UTILITY FUNCTIONS
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

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getDateString(daysOffset: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

// ============================================
// FETCH FUNCTIONS
// ============================================

async function fetchOpenMeteoForecast(
  location: Location,
  sourceId: string,
  modelId: string,
  days: number = 8
): Promise<DayPayload[] | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", location.lat.toString());
    url.searchParams.set("longitude", location.lon.toString());
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant");
    url.searchParams.set("models", modelId);
    url.searchParams.set("forecast_days", days.toString());
    url.searchParams.set("timezone", "Europe/Zurich");

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.warn(`Open-Meteo ${sourceId} failed for ${location.id}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.daily?.time) return null;

    return data.daily.time.map((date: string, i: number) => ({
      date,
      temperatureMin: data.daily.temperature_2m_min[i] ?? 0,
      temperatureMax: data.daily.temperature_2m_max[i] ?? 0,
      precipitationMm: data.daily.precipitation_sum[i] ?? 0,
      snowfallCm: data.daily.snowfall_sum[i] ?? 0,
      windMs: data.daily.wind_speed_10m_max[i] ?? 0,
      windGustMs: data.daily.wind_gusts_10m_max[i] ?? 0,
      windDirectionDeg: data.daily.wind_direction_10m_dominant[i] ?? 0,
      weatherCode: data.daily.weather_code[i] ?? 0,
    }));
  } catch (error) {
    console.warn(`Open-Meteo ${sourceId} error for ${location.id}:`, error);
    return null;
  }
}

async function fetchYrForecast(location: Location): Promise<DayPayload[] | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${location.lat}&lon=${location.lon}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LiftLager/1.0 github.com/liftlager (support@liftlager.app)",
      },
    });
    
    if (!response.ok) {
      console.warn(`Yr.no failed for ${location.id}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.properties?.timeseries) return null;

    // Aggregate hourly data into daily
    const dailyMap = new Map<string, {
      temps: number[];
      precip: number;
      wind: number[];
      windDir: number[];
      codes: number[];
    }>();

    for (const ts of data.properties.timeseries) {
      const date = ts.time.split("T")[0];
      const instant = ts.data?.instant?.details;
      const next1h = ts.data?.next_1_hours;
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { temps: [], precip: 0, wind: [], windDir: [], codes: [] });
      }
      
      const day = dailyMap.get(date)!;
      
      if (instant?.air_temperature !== undefined) {
        day.temps.push(instant.air_temperature);
      }
      if (instant?.wind_speed !== undefined) {
        day.wind.push(instant.wind_speed);
      }
      if (instant?.wind_from_direction !== undefined) {
        day.windDir.push(instant.wind_from_direction);
      }
      if (next1h?.details?.precipitation_amount !== undefined) {
        day.precip += next1h.details.precipitation_amount;
      }
      if (next1h?.summary?.symbol_code) {
        // Map Yr symbol codes to WMO codes (simplified)
        const code = yrSymbolToWmo(next1h.summary.symbol_code);
        day.codes.push(code);
      }
    }

    // Convert to daily payloads
    const result: DayPayload[] = [];
    const sortedDates = Array.from(dailyMap.keys()).sort();
    
    for (const date of sortedDates.slice(0, 8)) {
      const day = dailyMap.get(date)!;
      if (day.temps.length === 0) continue;
      
      result.push({
        date,
        temperatureMin: Math.min(...day.temps),
        temperatureMax: Math.max(...day.temps),
        precipitationMm: Math.round(day.precip * 10) / 10,
        snowfallCm: day.temps.every(t => t < 2) ? Math.round(day.precip * 10) / 10 : 0,
        windMs: Math.round(Math.max(...day.wind) * 10) / 10,
        windGustMs: Math.round(Math.max(...day.wind) * 1.3 * 10) / 10, // Estimate gusts
        windDirectionDeg: circularMeanDegrees(day.windDir),
        weatherCode: mostFrequent(day.codes) || 0,
      });
    }

    return result.length > 0 ? result : null;
  } catch (error) {
    console.warn(`Yr.no error for ${location.id}:`, error);
    return null;
  }
}

function yrSymbolToWmo(symbol: string): number {
  // Map Yr.no symbol codes to WMO weather codes
  if (symbol.includes("clearsky")) return 0;
  if (symbol.includes("fair")) return 1;
  if (symbol.includes("partlycloudy")) return 2;
  if (symbol.includes("cloudy")) return 3;
  if (symbol.includes("fog")) return 45;
  if (symbol.includes("heavyrain")) return 65;
  if (symbol.includes("lightrain")) return 61;
  if (symbol.includes("rain")) return 63;
  if (symbol.includes("heavysnow")) return 75;
  if (symbol.includes("lightsnow")) return 71;
  if (symbol.includes("snow")) return 73;
  if (symbol.includes("sleet")) return 69;
  if (symbol.includes("thunder")) return 95;
  return 3; // Default cloudy
}

function mostFrequent(arr: number[]): number {
  const counts = new Map<number, number>();
  let maxCount = 0;
  let result = 0;
  for (const val of arr) {
    const count = (counts.get(val) || 0) + 1;
    counts.set(val, count);
    if (count > maxCount) {
      maxCount = count;
      result = val;
    }
  }
  return result;
}

async function fetchObservedWeather(location: Location, date: string): Promise<DayPayload | null> {
  try {
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", location.lat.toString());
    url.searchParams.set("longitude", location.lon.toString());
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weather_code");
    url.searchParams.set("timezone", "Europe/Zurich");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.daily?.time?.[0]) return null;

    return {
      date: data.daily.time[0],
      temperatureMin: data.daily.temperature_2m_min[0] ?? 0,
      temperatureMax: data.daily.temperature_2m_max[0] ?? 0,
      precipitationMm: data.daily.precipitation_sum[0] ?? 0,
      snowfallCm: data.daily.snowfall_sum[0] ?? 0,
      windMs: data.daily.wind_speed_10m_max[0] ?? 0,
      windGustMs: data.daily.wind_gusts_10m_max[0] ?? 0,
      windDirectionDeg: data.daily.wind_direction_10m_dominant[0] ?? 0,
      weatherCode: data.daily.weather_code[0] ?? 0,
    };
  } catch (error) {
    console.warn(`Observed weather fetch failed for ${location.id}:`, error);
    return null;
  }
}

// ============================================
// SCORING & WEIGHTING
// ============================================

function calculateMAE(forecast: DayPayload, observed: DayPayload): {
  mae_temp: number;
  mae_wind: number;
  mae_precip: number;
  mae_snow: number;
  total_score: number;
} {
  const forecastTempMid = (forecast.temperatureMin + forecast.temperatureMax) / 2;
  const observedTempMid = (observed.temperatureMin + observed.temperatureMax) / 2;
  
  const mae_temp = Math.abs(forecastTempMid - observedTempMid);
  const mae_wind = Math.abs(forecast.windMs - observed.windMs);
  const mae_precip = Math.abs(forecast.precipitationMm - observed.precipitationMm);
  const mae_snow = Math.abs(forecast.snowfallCm - observed.snowfallCm);
  
  // Weighted total (temp most important for ski conditions)
  const total_score = (mae_temp * 0.45) + (mae_wind * 0.25) + (mae_precip * 0.20) + (mae_snow * 0.10);
  
  return { mae_temp, mae_wind, mae_precip, mae_snow, total_score };
}

function computeDynamicWeights(
  scores: Map<string, number[]>,
  baseWeights: Record<string, number>
): Record<string, number> {
  const avgScores: Record<string, number> = {};
  
  // Calculate average score per source
  for (const [sourceId, scoreList] of scores) {
    if (scoreList.length > 0) {
      avgScores[sourceId] = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
    }
  }
  
  if (Object.keys(avgScores).length === 0) {
    return { ...baseWeights };
  }
  
  // Convert scores to weights using softmax-like approach
  const k = 1.2; // Temperature parameter
  const minFloor = 0.05; // Minimum weight floor
  
  const expValues: Record<string, number> = {};
  for (const [sourceId, score] of Object.entries(avgScores)) {
    // Lower score = better = higher weight
    expValues[sourceId] = Math.exp(-score * k);
  }
  
  const sumExp = Object.values(expValues).reduce((a, b) => a + b, 0);
  
  // Blend with base weights (60% data-driven, 40% base)
  const result: Record<string, number> = {};
  for (const sourceId of Object.keys(baseWeights)) {
    const dataWeight = expValues[sourceId] ? (expValues[sourceId] / sumExp) : 0;
    const base = baseWeights[sourceId] || 0.1;
    result[sourceId] = Math.max(minFloor, (dataWeight * 0.6) + (base * 0.4));
  }
  
  // Normalize to sum to 1
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(result)) {
    result[key] = result[key] / total;
  }
  
  return result;
}

// ============================================
// AI AGGREGATION
// ============================================

interface AIResponse {
  davosDaily: Array<{
    date: string;
    tempMin: number;
    tempMax: number;
    tempMedian: number;
    precipMm: number;
    snowCm: number;
    windMs: number;
    windGustMs: number | null;
    windDirectionDeg: number | null;
    weatherCode: number;
    confidence: "low" | "medium" | "high";
  }>;
  aiSummaryToday: string;
  aiSummaryTomorrow: string;
  rationaleShort: string;
  category: QuoteCategory;
}

async function callAIForConsensus(
  forecasts: Map<string, DayPayload[]>,
  weights: Record<string, number>
): Promise<AIResponse | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  const apiKey = LOVABLE_API_KEY || OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("No AI API key configured");
    return null;
  }
  
  const apiUrl = LOVABLE_API_KEY 
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = LOVABLE_API_KEY ? "google/gemini-2.5-flash" : "gpt-4o-mini";
  
  // Build forecast summary for AI
  const forecastSummary: Record<string, unknown> = {};
  for (const [sourceId, days] of forecasts) {
    if (days.length > 0) {
      forecastSummary[sourceId] = {
        weight: Math.round((weights[sourceId] || 0) * 100) + "%",
        today: days[0],
        tomorrow: days[1] || null,
        week: days.slice(0, 7).map(d => ({
          date: d.date,
          temp: `${d.temperatureMin}°-${d.temperatureMax}°`,
          snow: d.snowfallCm + "cm",
          wind: d.windMs + "m/s",
        })),
      };
    }
  }
  
  const weightsStr = Object.entries(weights)
    .map(([k, v]) => `${k.toUpperCase()}: ${Math.round(v * 100)}%`)
    .join(", ");

  const prompt = `Du er en værekekspert for Davos skiområde i Sveits. Analyser værprognoser fra flere modeller og lag en KI-tolket konsensus.

MODELLVEKTER (basert på historisk treffsikkerhet siste 7 dager): ${weightsStr}

RÅDATA FRA MODELLENE:
${JSON.stringify(forecastSummary, null, 2)}

Svar i STRICT JSON-format (ingen markdown, kun JSON):
{
  "davosDaily": [
    {
      "date": "YYYY-MM-DD",
      "tempMin": <KI-justert min>,
      "tempMax": <KI-justert max>,
      "tempMedian": <midtpunkt>,
      "precipMm": <nedbør mm>,
      "snowCm": <snøfall cm>,
      "windMs": <vindstyrke m/s>,
      "windGustMs": <vindkast m/s>,
      "windDirectionDeg": <retning grader>,
      "weatherCode": <WMO-kode>,
      "confidence": "high|medium|low"
    }
  ],
  "aiSummaryToday": "1-2 setninger om dagens skiforhold",
  "aiSummaryTomorrow": "1-2 setninger om morgendagen",
  "rationaleShort": "Kort forklaring på valg/usikkerhet",
  "category": "sun_bluebird|powder_new_snow|storm_wind|whiteout_fog_flatlight|cold_snap|spring_slush_hot|ice_hardpack|apres"
}

REGLER:
- Hold deg nær vektet gjennomsnitt, ikke finn på ekstremverdier
- davosDaily skal ha 7 dager (i dag + 6 fremover)
- Velg category basert på dagens vær for sitatvalg
- Skriv på norsk`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Du er en værekekspert. Svar kun med valid JSON, ingen markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.warn("AI API failed:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    return JSON.parse(jsonMatch[0]) as AIResponse;
  } catch (error) {
    console.warn("AI call failed:", error);
    return null;
  }
}

// Fallback: compute weighted consensus without AI
function computeWeightedConsensus(
  forecasts: Map<string, DayPayload[]>,
  weights: Record<string, number>
): AIResponse {
  const sources = Array.from(forecasts.entries()).filter(([_, days]) => days.length > 0);
  if (sources.length === 0) {
    return {
      davosDaily: [],
      aiSummaryToday: "Ingen værdata tilgjengelig.",
      aiSummaryTomorrow: "Ingen værdata tilgjengelig.",
      rationaleShort: "Fallback - ingen kilder tilgjengelig",
      category: "sun_bluebird",
    };
  }
  
  const dayCount = Math.min(...sources.map(([_, days]) => days.length));
  const davosDaily: AIResponse["davosDaily"] = [];
  
  for (let i = 0; i < Math.min(dayCount, 7); i++) {
    let tempMinSum = 0, tempMaxSum = 0, precipSum = 0, snowSum = 0;
    let windSum = 0, gustSum = 0;
    const windDirs: number[] = [];
    const codes: number[] = [];
    let weightSum = 0;
    
    for (const [sourceId, days] of sources) {
      const day = days[i];
      if (!day) continue;
      
      const w = weights[sourceId] || 0.1;
      tempMinSum += day.temperatureMin * w;
      tempMaxSum += day.temperatureMax * w;
      precipSum += day.precipitationMm * w;
      snowSum += day.snowfallCm * w;
      windSum += day.windMs * w;
      gustSum += day.windGustMs * w;
      windDirs.push(day.windDirectionDeg);
      codes.push(day.weatherCode);
      weightSum += w;
    }
    
    if (weightSum === 0) continue;
    
    const tempMin = Math.round((tempMinSum / weightSum) * 10) / 10;
    const tempMax = Math.round((tempMaxSum / weightSum) * 10) / 10;
    
    davosDaily.push({
      date: sources[0][1][i].date,
      tempMin,
      tempMax,
      tempMedian: Math.round((tempMin + tempMax) / 2 * 10) / 10,
      precipMm: Math.round((precipSum / weightSum) * 10) / 10,
      snowCm: Math.round((snowSum / weightSum) * 10) / 10,
      windMs: Math.round((windSum / weightSum) * 10) / 10,
      windGustMs: Math.round((gustSum / weightSum) * 10) / 10,
      windDirectionDeg: circularMeanDegrees(windDirs),
      weatherCode: mostFrequent(codes),
      confidence: "medium",
    });
  }
  
  const today = davosDaily[0];
  const tomorrow = davosDaily[1];
  const category = classifyWeather(today);
  
  return {
    davosDaily,
    aiSummaryToday: today ? `Temperatur ${today.tempMin}° til ${today.tempMax}°C, ${windStrengthLabel(today.windMs)} fra ${windCompass(today.windDirectionDeg || 0)}.` : "Ingen data.",
    aiSummaryTomorrow: tomorrow ? `I morgen: ${tomorrow.tempMin}° til ${tomorrow.tempMax}°C, ${tomorrow.snowCm > 0 ? tomorrow.snowCm + "cm nysnø" : "lite nedbør"}.` : "Ingen data.",
    rationaleShort: "Fallback vektet gjennomsnitt (KI utilgjengelig)",
    category,
  };
}

function classifyWeather(day: AIResponse["davosDaily"][0] | undefined): QuoteCategory {
  if (!day) return "sun_bluebird";
  
  const { tempMin, tempMax, precipMm, snowCm, windMs, weatherCode } = day;
  const currentHour = new Date().getHours();
  
  // Snow codes
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode) || snowCm >= 6) {
    return "powder_new_snow";
  }
  
  // Storm/wind
  if ([95, 96, 99].includes(weatherCode) || windMs >= 14) {
    return "storm_wind";
  }
  
  // Fog/whiteout
  if ([45, 48].includes(weatherCode)) {
    return "whiteout_fog_flatlight";
  }
  
  // Cold
  if (tempMin <= -15) {
    return "cold_snap";
  }
  
  // Spring slush
  if (tempMax >= 8 && snowCm <= 0.5) {
    return "spring_slush_hot";
  }
  
  // Ice/hardpack
  if (tempMax <= 1 && snowCm <= 0.5 && precipMm <= 0.5) {
    return "ice_hardpack";
  }
  
  // Clear = sun or apres
  if ([0, 1, 2, 3].includes(weatherCode) && precipMm <= 0.3) {
    if (currentHour >= 15) {
      return "apres";
    }
    return "sun_bluebird";
  }
  
  // Default apres for evening
  if (currentHour >= 15 && tempMax >= 0 && windMs <= 10) {
    return "apres";
  }
  
  return "sun_bluebird";
}

// ============================================
// QUOTE SELECTION WITH ANTI-REPEAT
// ============================================

async function selectQuote(
  supabase: ReturnType<typeof createClient>,
  category: QuoteCategory
): Promise<Quote> {
  const quotes = ANCHORMAN_QUOTES[category];
  if (!quotes || quotes.length === 0) {
    return {
      quote: "You stay classy, San Diego.",
      speaker: "Ron Burgundy",
      category: "sun_bluebird",
    };
  }
  
  // Get recently used quotes (last 7 days)
  let recentHashes: Set<string> = new Set();
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data } = await supabase
      .from("quote_history")
      .select("quote_hash")
      .gte("last_used_at", sevenDaysAgo.toISOString().split("T")[0]);
    
    recentHashes = new Set((data || []).map((q: { quote_hash: string }) => q.quote_hash));
  } catch {
    // Ignore errors
  }
  
  // Filter out recently used
  const available = quotes.filter(q => {
    const hash = hashString(q.quote).toString();
    return !recentHashes.has(hash);
  });
  
  // If all used recently, use any
  const pool = available.length > 0 ? available : quotes;
  
  // Random selection with date seed for some stability
  const seed = hashString(getDateString() + category);
  const index = seed % pool.length;
  const selected = pool[index];
  
  // Record usage
  try {
    const hash = hashString(selected.quote).toString();
    await supabase
      .from("quote_history")
      .upsert({
        quote_hash: hash,
        speaker: selected.speaker,
        category,
        last_used_at: getDateString(),
        used_count: 1,
      }, { onConflict: "quote_hash" });
  } catch {
    // Ignore
  }
  
  return {
    quote: selected.quote,
    speaker: selected.speaker,
    category,
  };
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "get";

    // For refresh, require CRON_SECRET
    if (action === "refresh") {
      const cronHeader = req.headers.get("x-cron-secret");
      if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get locations
    const { data: locations } = await supabase
      .from("weather_locations")
      .select("*")
      .eq("is_active", true);

    if (!locations || locations.length === 0) {
      throw new Error("No weather locations configured");
    }

    const runAt = new Date().toISOString();

    if (action === "refresh") {
      // ============================================
      // REFRESH: Fetch all data, score, compute AI
      // ============================================
      console.log("Starting weather refresh...");

      // 1. Fetch forecasts from all sources for all locations
      const allForecasts: SourceForecast[] = [];
      
      for (const loc of locations.filter((l: Location) => l.id !== "davos_agg")) {
        // Open-Meteo models
        for (const [sourceId, modelId] of Object.entries(OPEN_METEO_MODELS)) {
          const daily = await fetchOpenMeteoForecast(loc as Location, sourceId, modelId);
          if (daily) {
            allForecasts.push({ sourceId, locationId: loc.id, daily });
          }
        }
        
        // Yr.no
        const yrDaily = await fetchYrForecast(loc as Location);
        if (yrDaily) {
          allForecasts.push({ sourceId: "yr", locationId: loc.id, daily: yrDaily });
        }
      }

      console.log(`Fetched ${allForecasts.length} forecast sets`);

      // 2. Store raw forecasts
      for (const forecast of allForecasts) {
        for (const day of forecast.daily) {
          try {
            await supabase.from("weather_raw_daily").upsert({
              run_at: runAt,
              source_id: forecast.sourceId,
              location_id: forecast.locationId,
              day_date: day.date,
              payload: day,
            }, { onConflict: "run_at,source_id,location_id,day_date" });
          } catch {
            // Ignore
          }
        }
      }

      // 3. Fetch observed weather for yesterday and score models
      const yesterday = getDateString(-1);
      const davosLoc = locations.find((l: Location) => l.id === "davos_agg") || locations[0];
      
      const observed = await fetchObservedWeather(davosLoc as Location, yesterday);
      const scoresBySource = new Map<string, number[]>();

      if (observed) {
        // Store observed
        try {
          await supabase.from("weather_observed_daily").upsert({
            location_id: "davos_agg",
            day_date: yesterday,
            observed,
          }, { onConflict: "location_id,day_date" });
        } catch {
          // Ignore
        }

        // Score each source's yesterday forecast
        const { data: rawForecasts } = await supabase
          .from("weather_raw_daily")
          .select("*")
          .eq("day_date", yesterday)
          .order("run_at", { ascending: false });

        const seenSources = new Set<string>();
        for (const raw of rawForecasts || []) {
          if (seenSources.has(raw.source_id)) continue;
          seenSources.add(raw.source_id);

          const scores = calculateMAE(raw.payload as DayPayload, observed);
          
          // Store score
          try {
            await supabase.from("weather_source_scores").upsert({
              location_id: "davos_agg",
              source_id: raw.source_id,
              day_date: yesterday,
              ...scores,
            }, { onConflict: "location_id,source_id,day_date" });
          } catch {
            // Ignore
          }
        }
      }

      // 4. Get rolling 7-day scores for weighting
      const sevenDaysAgo = getDateString(-7);
      const { data: recentScores } = await supabase
        .from("weather_source_scores")
        .select("source_id, total_score")
        .eq("location_id", "davos_agg")
        .gte("day_date", sevenDaysAgo);

      for (const score of recentScores || []) {
        const list = scoresBySource.get(score.source_id) || [];
        list.push(score.total_score);
        scoresBySource.set(score.source_id, list);
      }

      // 5. Compute dynamic weights
      const dynamicWeights = computeDynamicWeights(scoresBySource, BASE_WEIGHTS);
      console.log("Dynamic weights:", dynamicWeights);

      // 6. Aggregate forecasts per source for AI
      const aggregatedForecasts = new Map<string, DayPayload[]>();
      
      for (const sourceId of Object.keys(BASE_WEIGHTS)) {
        const sourceData = allForecasts.filter(f => f.sourceId === sourceId);
        if (sourceData.length === 0) continue;
        
        // Average across locations for this source
        const dayCount = Math.min(...sourceData.map(s => s.daily.length));
        const aggregated: DayPayload[] = [];
        
        for (let i = 0; i < dayCount; i++) {
          const days = sourceData.map(s => s.daily[i]).filter(Boolean);
          if (days.length === 0) continue;
          
          aggregated.push({
            date: days[0].date,
            temperatureMin: Math.round(days.reduce((a, d) => a + d.temperatureMin, 0) / days.length * 10) / 10,
            temperatureMax: Math.round(days.reduce((a, d) => a + d.temperatureMax, 0) / days.length * 10) / 10,
            precipitationMm: Math.round(days.reduce((a, d) => a + d.precipitationMm, 0) / days.length * 10) / 10,
            snowfallCm: Math.round(days.reduce((a, d) => a + d.snowfallCm, 0) / days.length * 10) / 10,
            windMs: Math.round(days.reduce((a, d) => a + d.windMs, 0) / days.length * 10) / 10,
            windGustMs: Math.round(days.reduce((a, d) => a + d.windGustMs, 0) / days.length * 10) / 10,
            windDirectionDeg: circularMeanDegrees(days.map(d => d.windDirectionDeg)),
            weatherCode: mostFrequent(days.map(d => d.weatherCode)),
          });
        }
        
        if (aggregated.length > 0) {
          aggregatedForecasts.set(sourceId, aggregated);
        }
      }

      // 7. Call AI for consensus
      let aiResult = await callAIForConsensus(aggregatedForecasts, dynamicWeights);
      
      if (!aiResult) {
        console.warn("AI failed, using weighted fallback");
        aiResult = computeWeightedConsensus(aggregatedForecasts, dynamicWeights);
      }

      // 8. Select quote
      const quote = await selectQuote(supabase, aiResult.category);

      // 9. Store AI daily result
      for (const day of aiResult.davosDaily) {
        try {
          await supabase.from("weather_ai_daily").upsert({
            run_at: runAt,
            location_id: "davos_agg",
            day_date: day.date,
            ai_daily: day,
            confidence: day.confidence,
            rationale_short: aiResult.rationaleShort,
            ai_summary_today: aiResult.aiSummaryToday,
            ai_summary_tomorrow: aiResult.aiSummaryTomorrow,
            quote,
            source_weights: dynamicWeights,
          }, { onConflict: "run_at,location_id,day_date" });
        } catch {
          // Ignore
        }
      }

      // 10. Update weather_cache for backward compatibility
      const cachePayload = {
        consensus: { daily: aiResult.davosDaily },
        models: Object.fromEntries(aggregatedForecasts),
        weights: dynamicWeights,
        confidence: aiResult.davosDaily[0]?.confidence || "medium",
        quote,
        aiSummary: aiResult.aiSummaryToday,
        aiSummaryToday: aiResult.aiSummaryToday,
        aiSummaryTomorrow: aiResult.aiSummaryTomorrow,
        dataSource: "Konsensus (KI-tolket)",
      };

      await supabase.from("weather_cache").upsert({
        mountain_id: "davos",
        generated_at: runAt,
        payload: cachePayload,
      }, { onConflict: "mountain_id" });

      // Also update per-mountain caches
      for (const loc of locations.filter((l: Location) => l.id !== "davos_agg")) {
        const mountainForecasts = allForecasts.filter(f => f.locationId === loc.id);
        const mountainModels = Object.fromEntries(
          mountainForecasts.map(f => [f.sourceId, f.daily])
        );
        
        await supabase.from("weather_cache").upsert({
          mountain_id: loc.id,
          generated_at: runAt,
          payload: {
            mountain: { id: loc.id, name: loc.name, elevation: loc.elevation_m },
            consensus: { daily: aiResult.davosDaily },
            models: mountainModels,
            weights: dynamicWeights,
            confidence: aiResult.davosDaily[0]?.confidence || "medium",
            quote,
            aiSummaryToday: aiResult.aiSummaryToday,
            aiSummaryTomorrow: aiResult.aiSummaryTomorrow,
            dataSource: "Konsensus (KI-tolket)",
          },
        }, { onConflict: "mountain_id" });
      }

      console.log("Weather refresh complete");

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Weather engine V2 refresh complete",
          sources: allForecasts.length,
          weights: dynamicWeights,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // GET: Return cached data
    // ============================================
    
    const { data: cache, error } = await supabase
      .from("weather_cache")
      .select("*")
      .order("mountain_id");

    if (error) throw error;

    const now = Date.now();
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 min

    const mountains = (cache || [])
      .filter((c: { mountain_id: string }) => c.mountain_id !== "davos")
      .map((c: { mountain_id: string; generated_at: string; payload: Record<string, unknown> }) => ({
        mountainId: c.mountain_id,
        stale: now - new Date(c.generated_at).getTime() > STALE_THRESHOLD,
        generatedAt: c.generated_at,
        ...c.payload,
      }));

    const davosRow = (cache || []).find((c: { mountain_id: string }) => c.mountain_id === "davos");
    const davos = davosRow ? {
      region: "Davos",
      generatedAt: davosRow.generated_at,
      stale: now - new Date(davosRow.generated_at).getTime() > STALE_THRESHOLD,
      ...davosRow.payload,
    } : null;

    return new Response(
      JSON.stringify({
        mountains,
        davos,
        stale: mountains.some((m: { stale: boolean }) => m.stale),
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Weather engine V2 error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
