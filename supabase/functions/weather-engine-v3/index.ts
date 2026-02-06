/**
 * Weather Engine V3 - AI-Accumulated Consensus with Dynamic Weighting
 * 
 * Features:
 * - Fetches from 5 sources: ECMWF, GFS, ICON, GEM, Yr.no (MET Norway)
 * - Historical scoring based on observed data (proxy from Open-Meteo Archive)
 * - Dynamic weighting with 7-day rolling window MAE scoring
 * - AI-aggregated consensus via Lovable AI Gateway
 * - AI directly selects quotes with anti-repeat logic
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

interface Quote {
  id: string;
  quote: string;
  speaker: string;
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
  ecmwf: 0.28,
  gfs: 0.18,
  icon: 0.22,
  gem: 0.14,
  yr: 0.18,
};

// Complete Anchorman quote bank with IDs
const QUOTE_BANK: Quote[] = [
  // Bluebird / Sunny
  { id: "q001", quote: "San Diego. Drink it in. It always goes down smooth.", speaker: "Ron Burgundy" },
  { id: "q002", quote: "By the beard of Zeus!", speaker: "Ron Burgundy" },
  { id: "q003", quote: "You stay classy, San Diego.", speaker: "Ron Burgundy" },
  { id: "q004", quote: "I don't know how to put this, but I'm kind of a big deal.", speaker: "Ron Burgundy" },
  { id: "q005", quote: "I have many leather-bound books, and my apartment smells of rich mahogany.", speaker: "Ron Burgundy" },
  { id: "q006", quote: "Super duper, gang! Super duper!", speaker: "Ron Burgundy" },
  // Powder / Snow
  { id: "q007", quote: "Cannonball!", speaker: "Ron Burgundy" },
  { id: "q008", quote: "Great Odin's raven!", speaker: "Ron Burgundy" },
  { id: "q009", quote: "Panda Watch! The mood is tense.", speaker: "Brian Fantana" },
  { id: "q010", quote: "60% of the time, it works every time.", speaker: "Brian Fantana" },
  { id: "q011", quote: "There were horses and a man on fire, and I killed a guy with a trident.", speaker: "Brick Tamland" },
  { id: "q012", quote: "I love lamp.", speaker: "Brick Tamland" },
  // Storm / Wind
  { id: "q013", quote: "Boy, that escalated quickly.", speaker: "Ron Burgundy" },
  { id: "q014", quote: "I mean, that really got out of hand fast!", speaker: "Ron Burgundy" },
  { id: "q015", quote: "It jumped up a notch.", speaker: "Champ Kind" },
  { id: "q016", quote: "Whammy!", speaker: "Champ Kind" },
  { id: "q017", quote: "News team, assemble!", speaker: "Ron Burgundy" },
  // Fog / Whiteout
  { id: "q018", quote: "I'm in a glass case of emotion!", speaker: "Ron Burgundy" },
  { id: "q019", quote: "I don't know what we're yelling about!", speaker: "Brick Tamland" },
  { id: "q020", quote: "Loud noises!", speaker: "Brick Tamland" },
  { id: "q021", quote: "I'm Ron Burgundy?", speaker: "Ron Burgundy" },
  { id: "q022", quote: "That doesn't make any sense.", speaker: "Ron Burgundy" },
  // Cold
  { id: "q023", quote: "Mm, I love scotch. I love Scotch. Scotchy, Scotch, Scotch.", speaker: "Ron Burgundy" },
  { id: "q024", quote: "Here it goes down. Down into my belly.", speaker: "Ron Burgundy" },
  { id: "q025", quote: "It stings the nostrils.", speaker: "Ron Burgundy" },
  { id: "q026", quote: "In a good way.", speaker: "Ron Burgundy" },
  // Hot / Spring
  { id: "q027", quote: "It's so damn hot... milk was a bad choice!", speaker: "Ron Burgundy" },
  { id: "q028", quote: "Milk was a bad choice.", speaker: "Ron Burgundy" },
  { id: "q029", quote: "Neat-o, gang.", speaker: "Ron Burgundy" },
  { id: "q030", quote: "I'm expressing my inner anguish THROUGH THE MAJESTY OF SONG!", speaker: "Ron Burgundy" },
  // Ice / Hardpack
  { id: "q031", quote: "Keep your head on a swivel.", speaker: "Ron Burgundy" },
  { id: "q032", quote: "That's bush. Bush league.", speaker: "Ron Burgundy" },
  { id: "q033", quote: "Anything you put on that prompter, Burgundy will read!", speaker: "Ed Harken" },
  { id: "q034", quote: "Big deal. I am very professional.", speaker: "Ron Burgundy" },
  // Après
  { id: "q035", quote: "We've been coming to the same party for 12 years now...and in no way is that depressing.", speaker: "Ron Burgundy" },
  { id: "q036", quote: "Champ here. I'm all about havin' fun.", speaker: "Champ Kind" },
  { id: "q037", quote: "Time to musk up.", speaker: "Brian Fantana" },
  { id: "q038", quote: "They've done studies, you know.", speaker: "Brian Fantana" },
  // Veronica
  { id: "q039", quote: "Mr. Burgundy, you have a massive erection.", speaker: "Veronica Corningstone" },
  { id: "q040", quote: "Take me to Pleasure Town.", speaker: "Veronica Corningstone" },
];

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

function getDateString(daysOffset: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
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
        "User-Agent": "Lift & Lager (private beta) contact: eskilhgn@gmail.com",
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
      
      const maxTemp = Math.max(...day.temps);
      const minTemp = Math.min(...day.temps);
      const isSnowLikely = minTemp < 2 && maxTemp < 5;
      
      result.push({
        date,
        temperatureMin: Math.round(minTemp * 10) / 10,
        temperatureMax: Math.round(maxTemp * 10) / 10,
        precipitationMm: Math.round(day.precip * 10) / 10,
        snowfallCm: isSnowLikely ? Math.round(day.precip * 10) / 10 : 0,
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
  const s = symbol.toLowerCase();
  if (s.includes("clearsky")) return 0;
  if (s.includes("fair")) return 1;
  if (s.includes("partlycloudy")) return 2;
  if (s.includes("cloudy")) return 3;
  if (s.includes("fog")) return 45;
  if (s.includes("heavyrain")) return 65;
  if (s.includes("lightrain")) return 61;
  if (s.includes("rain")) return 63;
  if (s.includes("heavysnow")) return 75;
  if (s.includes("lightsnow")) return 71;
  if (s.includes("snow")) return 73;
  if (s.includes("sleet")) return 69;
  if (s.includes("thunder")) return 95;
  return 3;
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
  
  for (const [sourceId, scoreList] of scores) {
    if (scoreList.length > 0) {
      avgScores[sourceId] = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
    }
  }
  
  if (Object.keys(avgScores).length === 0) {
    return { ...baseWeights };
  }
  
  // Softmax-like inverse scoring
  const k = 1.0;
  const minFloor = 0.08;
  
  const expValues: Record<string, number> = {};
  for (const [sourceId, score] of Object.entries(avgScores)) {
    expValues[sourceId] = Math.exp(-score * k);
  }
  
  const sumExp = Object.values(expValues).reduce((a, b) => a + b, 0);
  
  // Blend 65% data-driven, 35% base weights
  const result: Record<string, number> = {};
  for (const sourceId of Object.keys(baseWeights)) {
    const dataWeight = expValues[sourceId] ? (expValues[sourceId] / sumExp) : 0;
    const base = baseWeights[sourceId] || 0.1;
    result[sourceId] = Math.max(minFloor, (dataWeight * 0.65) + (base * 0.35));
  }
  
  // Normalize to sum to 1
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(result)) {
    result[key] = Math.round((result[key] / total) * 1000) / 1000;
  }
  
  return result;
}

// ============================================
// AI-ACCUMULATED CONSENSUS
// ============================================

interface AIOutput {
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
    confidence: number;
  }>;
  aiSummaryToday: string;
  aiSummaryTomorrow: string;
  rationaleShort: string;
  selectedQuoteId: string;
  quoteReason: string;
}

async function callAIForAccumulatedConsensus(
  forecasts: Map<string, DayPayload[]>,
  weights: Record<string, number>,
  recentQuoteIds: string[]
): Promise<AIOutput | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not configured");
    return null;
  }
  
  // Build forecast summary for AI
  const forecastSummary: Record<string, unknown> = {};
  for (const [sourceId, days] of forecasts) {
    if (days.length > 0) {
      forecastSummary[sourceId] = {
        weight: `${Math.round((weights[sourceId] || 0) * 100)}%`,
        today: days[0],
        tomorrow: days[1] || null,
        day3to7: days.slice(2, 7).map(d => ({
          date: d.date,
          temp: `${d.temperatureMin}° til ${d.temperatureMax}°`,
          snow: `${d.snowfallCm}cm`,
          wind: `${d.windMs}m/s`,
          code: d.weatherCode,
        })),
      };
    }
  }
  
  // Calculate spread (disagreement) between sources
  const todayTemps = Array.from(forecasts.values())
    .filter(days => days.length > 0)
    .map(days => (days[0].temperatureMin + days[0].temperatureMax) / 2);
  
  const tempSpread = todayTemps.length > 1 
    ? Math.max(...todayTemps) - Math.min(...todayTemps)
    : 0;
  
  const weightsStr = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.toUpperCase()}: ${Math.round(v * 100)}%`)
    .join(", ");

  // Quote bank for AI to choose from
  const quoteBankForAI = QUOTE_BANK.map(q => ({
    id: q.id,
    quote: q.quote,
    speaker: q.speaker,
  }));

  const prompt = `Du er en værekekspert for Davos skiområde i Sveits. Analyser værprognoser fra 5 modeller og lag en KI-akkumulert prognose.

MODELLVEKTER (basert på 7-dagers historisk treffsikkerhet): ${weightsStr}
TEMPERATURSPREDNING: ${tempSpread.toFixed(1)}°C mellom modellene

RÅDATA FRA MODELLENE:
${JSON.stringify(forecastSummary, null, 2)}

ANCHORMAN-SITATER (velg én basert på værforhold):
${JSON.stringify(quoteBankForAI, null, 2)}

NYLIG BRUKTE SITAT-ID'er (unngå disse): ${recentQuoteIds.length > 0 ? recentQuoteIds.join(", ") : "ingen"}

OPPGAVE:
1. Beregn KI-akkumulert prognose ved å vekte kildene ut fra deres vekter
2. Juster basert på din ekspertise (ikke bare matematisk gjennomsnitt)
3. Velg et passende Anchorman-sitat basert på værforholdet
4. Skriv korte oppsummeringer for skifolket

Svar i STRICT JSON (kun JSON, ingen markdown):
{
  "davosDaily": [
    {
      "date": "YYYY-MM-DD",
      "tempMin": <KI-akkumulert min>,
      "tempMax": <KI-akkumulert max>,
      "tempMedian": <midtpunkt>,
      "precipMm": <nedbør>,
      "snowCm": <snøfall>,
      "windMs": <vind>,
      "windGustMs": <kast eller null>,
      "windDirectionDeg": <retning>,
      "weatherCode": <WMO-kode>,
      "confidence": <0-100 prosent>
    }
  ],
  "aiSummaryToday": "1-2 setninger om dagens skiforhold",
  "aiSummaryTomorrow": "1-2 setninger om morgendagen",
  "rationaleShort": "Kort forklaring på valg/usikkerhet",
  "selectedQuoteId": "<quote ID fra listen>",
  "quoteReason": "Kort grunn til valget"
}

REGLER:
- davosDaily skal ha 7 dager
- confidence 80-100 hvis lav spredning, 50-79 hvis middels, under 50 hvis høy usikkerhet
- Velg sitat som IKKE er i "nylig brukte" listen
- Skriv på norsk, være relevant for skifolk`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Du er en værekspert. Svar kun med valid JSON, ingen markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("AI API failed:", response.status, errText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("No JSON found in AI response");
      return null;
    }
    
    return JSON.parse(jsonMatch[0]) as AIOutput;
  } catch (error) {
    console.warn("AI call failed:", error);
    return null;
  }
}

// Fallback: compute weighted consensus without AI
function computeWeightedConsensus(
  forecasts: Map<string, DayPayload[]>,
  weights: Record<string, number>
): AIOutput {
  const sources = Array.from(forecasts.entries()).filter(([_, days]) => days.length > 0);
  if (sources.length === 0) {
    return {
      davosDaily: [],
      aiSummaryToday: "Ingen værdata tilgjengelig.",
      aiSummaryTomorrow: "Ingen værdata tilgjengelig.",
      rationaleShort: "Fallback - ingen kilder tilgjengelig",
      selectedQuoteId: "q003",
      quoteReason: "Default fallback",
    };
  }
  
  const dayCount = Math.min(...sources.map(([_, days]) => days.length));
  const davosDaily: AIOutput["davosDaily"] = [];
  
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
      confidence: 65,
    });
  }
  
  const today = davosDaily[0];
  const tomorrow = davosDaily[1];
  
  return {
    davosDaily,
    aiSummaryToday: today ? `Temperatur ${today.tempMin}° til ${today.tempMax}°C, ${windStrengthLabel(today.windMs)} fra ${windCompass(today.windDirectionDeg || 0)}.` : "Ingen data.",
    aiSummaryTomorrow: tomorrow ? `I morgen: ${tomorrow.tempMin}° til ${tomorrow.tempMax}°C${tomorrow.snowCm > 0 ? `, ${tomorrow.snowCm}cm nysnø` : ""}.` : "Ingen data.",
    rationaleShort: "Vektet gjennomsnitt (KI utilgjengelig)",
    selectedQuoteId: "q003",
    quoteReason: "Default fallback",
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
      // REFRESH: Fetch all data, score, compute AI consensus
      // ============================================
      console.log("Starting weather engine V3 refresh...");

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
        
        // Yr.no (MET Norway)
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

      // 7. Get recent quote IDs to avoid repeats
      let recentQuoteIds: string[] = [];
      try {
        const thirtyDaysAgo = getDateString(-30);
        const { data: recentQuotes } = await supabase
          .from("quote_usage")
          .select("quote_hash")
          .gte("used_at", thirtyDaysAgo)
          .order("used_at", { ascending: false })
          .limit(15);
        
        recentQuoteIds = (recentQuotes || []).map((q: { quote_hash: string }) => q.quote_hash);
      } catch {
        // Ignore
      }

      // 8. Call AI for accumulated consensus
      let aiResult = await callAIForAccumulatedConsensus(aggregatedForecasts, dynamicWeights, recentQuoteIds);
      
      if (!aiResult) {
        console.warn("AI failed, using weighted fallback");
        aiResult = computeWeightedConsensus(aggregatedForecasts, dynamicWeights);
      }

      // 9. Get the selected quote
      const selectedQuote = QUOTE_BANK.find(q => q.id === aiResult.selectedQuoteId) 
        || QUOTE_BANK.find(q => q.id === "q003") // fallback
        || QUOTE_BANK[0];

      const quote = {
        quote: selectedQuote.quote,
        speaker: selectedQuote.speaker,
        category: "ai_selected",
      };

      // 10. Record quote usage
      try {
        await supabase.from("quote_usage").insert({
          quote_hash: selectedQuote.id,
          category: "ai_selected",
          speaker: selectedQuote.speaker,
          used_at: getDateString(),
        });
      } catch {
        // Ignore duplicates
      }

      // 11. Store AI daily result
      for (const day of aiResult.davosDaily) {
        const confidenceStr = day.confidence >= 80 ? "high" : day.confidence >= 50 ? "medium" : "low";
        try {
          await supabase.from("weather_ai_daily").upsert({
            run_at: runAt,
            location_id: "davos_agg",
            day_date: day.date,
            ai_daily: day,
            confidence: confidenceStr,
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

      // 12. Update weather_cache for frontend
      const consensusDaily = aiResult.davosDaily.map(d => ({
        date: d.date,
        tempMax: d.tempMax,
        tempMin: d.tempMin,
        tempMedian: d.tempMedian,
        precipitation: d.precipMm,
        snowfall: d.snowCm,
        windSpeed: d.windMs,
        windGust: d.windGustMs || d.windMs * 1.3,
        windDirection: d.windDirectionDeg || 0,
        windLabel: windStrengthLabel(d.windMs),
        windCompass: windCompass(d.windDirectionDeg || 0),
        weatherCode: d.weatherCode,
        confidence: d.confidence >= 80 ? "high" : d.confidence >= 50 ? "medium" : "low",
      }));

      const cachePayload = {
        consensus: { daily: consensusDaily },
        models: Object.fromEntries(
          Array.from(aggregatedForecasts.entries()).map(([k, v]) => [k, { daily: v }])
        ),
        weights: dynamicWeights,
        confidence: consensusDaily[0]?.confidence || "medium",
        quote,
        aiSummaryToday: aiResult.aiSummaryToday,
        aiSummaryTomorrow: aiResult.aiSummaryTomorrow,
        dataSource: "KI-akkumulert",
        yrAvailable: aggregatedForecasts.has("yr"),
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
          mountainForecasts.map(f => [f.sourceId, { daily: f.daily }])
        );
        
        await supabase.from("weather_cache").upsert({
          mountain_id: loc.id,
          generated_at: runAt,
          payload: {
            mountain: { id: loc.id, name: loc.name, elevation: loc.elevation_m },
            consensus: { daily: consensusDaily },
            models: mountainModels,
            weights: dynamicWeights,
            confidence: consensusDaily[0]?.confidence || "medium",
            quote,
            aiSummaryToday: aiResult.aiSummaryToday,
            aiSummaryTomorrow: aiResult.aiSummaryTomorrow,
            dataSource: "KI-akkumulert",
          },
        }, { onConflict: "mountain_id" });
      }

      console.log("Weather engine V3 refresh complete");

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Weather engine V3 refresh complete",
          sources: allForecasts.length,
          weights: dynamicWeights,
          yrAvailable: aggregatedForecasts.has("yr"),
          selectedQuote: selectedQuote.id,
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
    console.error("Weather engine V3 error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
