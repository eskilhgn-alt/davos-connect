/**
 * Weather AI Summary Edge Function
 * Fetches forecasts from both Yr.no and MeteoSwiss (via sister edge functions),
 * sends both to OpenAI (via Lovable AI Gateway) for a holistic ski-focused assessment.
 * Caches result in weather_ai_daily table.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================
// TYPES
// ============================================

interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
  snow: number;
  wind: number;
  windGust?: number;
  windDir: number;
  weatherCode: number;
}

interface SourceData {
  source: string;
  sourceName: string;
  updatedAt: string;
  daily: DailyForecast[];
}

interface AISummaryResult {
  overallAssessment: string;
  todaySummary: string;
  tomorrowSummary: string;
  sourceComparison: string;
  skiConditions: string;
  confidence: "high" | "medium" | "low";
  generatedAt: string;
}

// ============================================
// HELPERS
// ============================================

const DAVOS_LAT = "46.80";
const DAVOS_LON = "9.84";

function getLocationParams(req: Request): { lat: string; lon: string; locationId: string } {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat") || DAVOS_LAT;
  const lon = url.searchParams.get("lon") || DAVOS_LON;
  // Use "davos" as location_id if coordinates match default, otherwise create an id from coords
  const locationId = (lat === DAVOS_LAT && lon === DAVOS_LON) ? "davos" : `custom_${lat}_${lon}`;
  return { lat, lon, locationId };
}

async function fetchSourceForecast(
  baseUrl: string,
  anonKey: string,
  fnName: string,
  lat: string,
  lon: string
): Promise<SourceData | null> {
  try {
    const response = await fetch(
      `${baseUrl}/functions/v1/${fnName}?lat=${lat}&lon=${lon}`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );
    if (!response.ok) {
      console.warn(`${fnName} returned ${response.status}`);
      const body = await response.text();
      console.warn(`${fnName} body: ${body}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.warn(`Failed to fetch ${fnName}:`, err);
    return null;
  }
}

function formatDailyForPrompt(daily: DailyForecast[]): string {
  return daily
    .slice(0, 7)
    .map(
      (d) =>
        `${d.date}: ${d.tempMin}°/${d.tempMax}°, nedbør ${d.precip}mm, snø ${d.snow}cm, vind ${d.wind}m/s${d.windGust ? ` (kast ${d.windGust}m/s)` : ""}, WMO-kode ${d.weatherCode}`
    )
    .join("\n");
}

// ============================================
// MAIN
// ============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lat, lon, locationId } = getLocationParams(req);

    // Check cache first (return cached if < 30 min old)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split("T")[0];

    const { data: cached } = await supabase
      .from("weather_ai_daily")
      .select("*")
      .eq("location_id", locationId)
      .eq("day_date", today)
      .order("run_at", { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.run_at).getTime();
      const THIRTY_MIN = 30 * 60 * 1000;
      if (cacheAge < THIRTY_MIN) {
        console.log("Returning cached AI summary");
        const cachedAiDaily = cached.ai_daily as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            todaySummary: cached.ai_summary_today,
            tomorrowSummary: cached.ai_summary_tomorrow,
            sourceComparison: cachedAiDaily?.sourceComparison || "",
            skiConditions: cachedAiDaily?.skiConditions || "",
            confidence: cached.confidence,
            confidenceReason: cached.rationale_short,
            generatedAt: cached.run_at,
            cached: true,
            weather: cachedAiDaily?.weather || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch both sources in parallel using the requested coordinates
    const [yr, meteoswiss] = await Promise.all([
      fetchSourceForecast(SUPABASE_URL, SUPABASE_ANON_KEY, "weather-yr", lat, lon),
      fetchSourceForecast(SUPABASE_URL, SUPABASE_ANON_KEY, "weather-meteoswiss", lat, lon),
    ]);

    if (!yr && !meteoswiss) {
      return new Response(
        JSON.stringify({ error: "Both weather sources unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the prompt
    let dataSection = "";
    if (yr?.daily) {
      dataSection += `\n## Yr.no (MET Norway) — Norsk Meteorologisk Institutt\n${formatDailyForPrompt(yr.daily)}\n`;
    }
    if (meteoswiss?.daily) {
      dataSection += `\n## MeteoSwiss (ICON-modell via Open-Meteo) — Sveitsisk Meteorologisk Institutt\n${formatDailyForPrompt(meteoswiss.daily)}\n`;
    }

    const locationLabel = locationId === "davos" ? "Davos, Sveits (1560 moh)" : `posisjon ${lat}°N, ${lon}°Ø`;
    const prompt = `Du er en ekspert-meteorolog som spesialiserer seg på alpint skivær i ${locationLabel}.
Du har fått prognoser fra to uavhengige værkilder. Analyser begge og gi en helhetlig vurdering.

${dataSection}

OPPGAVE:
Sammenlign de to kildene og gi en helhetlig, ærlig vurdering av værforholdene for skifolk.

Svar som JSON (kun JSON, ingen markdown-blokker):
{
  "todaySummary": "2-3 setninger om dagens skiforhold basert på begge kilder. Nevn enighet/uenighet.",
  "tomorrowSummary": "2-3 setninger om morgendagens forhold. Nevn enighet/uenighet.",
  "sourceComparison": "1-2 setninger om hvor enige kildene er, og hvilken som virker mest pålitelig for dette tilfellet.",
  "skiConditions": "1 setning: råd til skifolk (f.eks. 'Perfekt puddervær!' eller 'Isete – pass på kantene')",
  "confidence": "high|medium|low",
  "confidenceReason": "Kort begrunnelse for konfidensnivå"
}

REGLER:
- Skriv på norsk
- Vær konkret med tall (temperaturer, snømengder, vindstyrke)
- Fokuser på det som er relevant for skifolk i Davos
- Hvis kildene er uenige, forklar hvorfor og hvilken du stoler mest på
- confidence: "high" hvis kildene er enige, "medium" hvis noe uenighet, "low" hvis stor sprik`;

    // Call OpenAI via Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Du er en norskspråklig værekspert for alpint skivær. Svar kun med valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit exceeded, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON from AI response (strip markdown fences if present)
    let parsed: Record<string, unknown>;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI JSON:", content);
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract structured weather numbers from the source data for dashboard use
    const msDaily = meteoswiss?.daily?.[0];
    const yrNow = (yr as any)?.now;
    const msNow = (meteoswiss as any)?.now;
    const nowData = msNow || yrNow;

    const weather = {
      temp: nowData?.temp ?? msDaily?.tempMax ?? null,
      tempMin: msDaily?.tempMin ?? yr?.daily?.[0]?.tempMin ?? null,
      tempMax: msDaily?.tempMax ?? yr?.daily?.[0]?.tempMax ?? null,
      wind: nowData?.wind ?? msDaily?.wind ?? null,
      windDir: nowData?.windDir ?? msDaily?.windDir ?? 0,
      weatherCode: nowData?.weatherCode ?? msDaily?.weatherCode ?? 0,
      precip: msDaily?.precip ?? yr?.daily?.[0]?.precip ?? 0,
      snow: msDaily?.snow ?? yr?.daily?.[0]?.snow ?? 0,
    };

    const result = {
      todaySummary: (parsed.todaySummary as string) || "",
      tomorrowSummary: (parsed.tomorrowSummary as string) || "",
      sourceComparison: (parsed.sourceComparison as string) || "",
      skiConditions: (parsed.skiConditions as string) || "",
      confidence: (parsed.confidence as string) || "medium",
      confidenceReason: (parsed.confidenceReason as string) || "",
      generatedAt: new Date().toISOString(),
      cached: false,
      weather,
    };

    // Cache to weather_ai_daily
    const aiDailyPayload = {
      todaySummary: result.todaySummary,
      tomorrowSummary: result.tomorrowSummary,
      sourceComparison: result.sourceComparison,
      skiConditions: result.skiConditions,
      confidenceReason: result.confidenceReason,
      weather,
    };

    // Cache to DB — only for known locations (FK constraint on location_id)
    if (locationId === "davos") {
      await supabase.from("weather_ai_daily").upsert(
        {
          location_id: locationId,
          day_date: today,
          ai_daily: aiDailyPayload,
          ai_summary_today: result.todaySummary,
          ai_summary_tomorrow: result.tomorrowSummary,
          confidence: result.confidence,
          rationale_short: result.confidenceReason,
          source_weights: { yr: yr ? 0.5 : 0, meteoswiss: meteoswiss ? 0.5 : 0 },
          run_at: new Date().toISOString(),
        },
        { onConflict: "location_id,day_date" }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("weather-ai-summary error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
