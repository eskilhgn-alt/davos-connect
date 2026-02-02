/**
 * Weather Engine Refresh - Cron-triggered Edge Function
 * Fetches Open-Meteo forecasts for all mountains, computes consensus, caches results
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

const WEATHER_MODELS = [
  { id: "ecmwf_ifs025", name: "ECMWF" },
  { id: "gfs_seamless", name: "GFS" },
  { id: "icon_seamless", name: "ICON" },
  { id: "gem_seamless", name: "GEM" }
] as const;

const BASE_WEIGHTS: Record<string, number> = {
  ecmwf_ifs025: 0.45,
  gfs_seamless: 0.20,
  icon_seamless: 0.25,
  gem_seamless: 0.10
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
  ],
  storm_wind: [
    { quote: "Boy, that escalated quickly.", speaker: "Ron Burgundy", use: "vær som går fra 0 til 100" },
    { quote: "I mean, that really got out of hand fast!", speaker: "Ron Burgundy", use: "storm + kaos" },
    { quote: "It jumped up a notch.", speaker: "Champ Kind", use: "vinden tar over" },
    { quote: "There were horses and a man on fire...", speaker: "Brick Tamland", use: "ren storm-fantasi" },
    { quote: "The sewers run red with Burgundy's blood.", speaker: "Arturo Mendez", use: "overdrevent stormdrama" },
    { quote: "Policia!", speaker: "Arturo Mendez", use: "storm = 'løp'" },
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
    { quote: "Cannonball!", speaker: "Ron Burgundy", use: "vårføre = lek" },
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
    { quote: "Go fuck yourself, San Diego!", speaker: "Ron Burgundy", use: "rowdy etterfest" },
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

  // Consensus hourly - simplified weighted average
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
// QUOTE SELECTION
// ============================================

const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const THUNDER_CODES = [95, 96, 99];
const FOG_CODES = [45, 48];
const CLEAR_CODES = [0, 1, 2, 3];

function classifyWeather(day: ConsensusDay, cloudCover?: number): QuoteCategory {
  const { tempMin, tempMax, precipitation, snowfall, windSpeed, windGust, weatherCode } = day;
  const currentHour = new Date().getHours();

  // Priority order - check most specific/severe conditions first
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

function selectQuote(
  mountainId: string,
  date: string,
  category: QuoteCategory
): { quote: string; speaker: string; category: QuoteCategory } {
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

  // Deterministic selection using stable seed
  const seed = `${mountainId}-${date}-${category}`;
  const hash = hashString(seed);
  const index = hash % validQuotes.length;
  const selected = validQuotes[index];

  return {
    quote: selected.quote,
    speaker: selected.speaker,
    category,
  };
}

// ============================================
// AI SUMMARY (OPTIONAL)
// ============================================

async function generateAiSummary(
  mountainName: string,
  consensus: ConsensusDay
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return null;
  }

  try {
    const prompt = `Du er en erfaren skiinstruktør i Davos. Gi en kort, personlig væranbefaling (maks 1 setning) basert på dette:
Fjell: ${mountainName}
Dato: ${consensus.date}
Temp: ${consensus.tempMin}° til ${consensus.tempMax}°C
Snøfall: ${consensus.snowfall} cm
Vind: ${consensus.windSpeed} m/s (${consensus.windLabel}) fra ${consensus.windCompass}
Nedbør: ${consensus.precipitation} mm

Svar på norsk, vær kort og konkret. Bruk gjerne humor.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.warn("AI summary failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.warn("AI summary error:", error);
    return null;
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

    // Fetch custom weights if any
    const { data: customWeights } = await supabase
      .from("weather_model_weights")
      .select("mountain_id, weights");

    const weightsMap: Record<string, Record<string, number>> = {};
    if (customWeights) {
      for (const row of customWeights) {
        weightsMap[row.mountain_id] = row.weights as Record<string, number>;
      }
    }

    const results: Record<string, unknown> = {};
    const forecastDays = 10;

    // Process each mountain
    for (const mountain of MOUNTAINS) {
      console.log(`Processing ${mountain.name}...`);

      // Fetch all models in parallel
      const modelPromises = WEATHER_MODELS.map(model =>
        fetchModelForecast(mountain, model.id, model.name, forecastDays)
      );
      const modelResults = await Promise.all(modelPromises);
      const validForecasts = modelResults.filter((f): f is ModelForecast => f !== null);

      if (validForecasts.length === 0) {
        console.warn(`No valid forecasts for ${mountain.name}`);
        continue;
      }

      // Get weights for this mountain
      const weights = weightsMap[mountain.id] || BASE_WEIGHTS;

      // Compute consensus
      const consensus = computeConsensus(validForecasts, weights);

      // Get today's consensus for quote and AI
      const today = consensus.daily[0];
      const avgCloudCover = consensus.hourly.slice(0, 24).reduce((sum, h) => sum + h.cloudCover, 0) / 24;

      // Classify weather and select quote
      const category = classifyWeather(today, avgCloudCover);
      const quote = selectQuote(mountain.id, today.date, category);

      // Optional AI summary
      const aiSummary = await generateAiSummary(mountain.name, today);

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
          validForecasts.map(f => [f.modelName, { daily: f.daily, hourly: f.hourly }])
        ),
        weights,
        confidence: today.confidence,
        quote,
        aiSummary,
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

    // Also create a "davos" aggregate entry
    const { data: allCached } = await supabase
      .from("weather_cache")
      .select("payload")
      .in("mountain_id", MOUNTAINS.map(m => m.id));

    if (allCached && allCached.length > 0) {
      // Create regional summary from first mountain's today data
      const firstPayload = allCached[0].payload as { consensus: { daily: ConsensusDay[] }; quote: { quote: string; speaker: string; category: QuoteCategory } };
      const todayConsensus = firstPayload.consensus.daily[0];
      
      const davosPayload = {
        region: "davos",
        generatedAt: new Date().toISOString(),
        mountains: MOUNTAINS.map(m => m.id),
        todaySummary: todayConsensus,
        quote: firstPayload.quote,
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
      JSON.stringify({ success: true, results, timestamp: new Date().toISOString() }),
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
