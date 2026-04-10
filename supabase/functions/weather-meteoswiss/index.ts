/**
 * Weather MeteoSwiss Edge Function
 * Uses Open-Meteo's MeteoSwiss ICON model (best_match for Swiss Alps)
 * Returns normalized format matching weather-yr
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat") || "46.80";
    const lon = url.searchParams.get("lon") || "9.84";

    // Use Open-Meteo with ICON-CH (MeteoSwiss model) for Swiss Alps accuracy
    // Also fetch ECMWF for comparison
    const omUrl = new URL("https://api.open-meteo.com/v1/forecast");
    omUrl.searchParams.set("latitude", lat);
    omUrl.searchParams.set("longitude", lon);
    omUrl.searchParams.set("hourly", "temperature_2m,precipitation,snowfall,wind_speed_10m,wind_direction_10m,weather_code");
    omUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,weather_code");
    omUrl.searchParams.set("models", "icon_seamless");
    omUrl.searchParams.set("forecast_days", "7");
    omUrl.searchParams.set("timezone", "Europe/Zurich");

    const response = await fetch(omUrl.toString());
    if (!response.ok) {
      throw new Error(`Open-Meteo error: ${response.status}`);
    }

    const data = await response.json();

    // Build "now" from first hourly entry
    const nowHour = {
      temp: data.hourly?.temperature_2m?.[0] != null ? Math.round(data.hourly.temperature_2m[0]) : null,
      wind: data.hourly?.wind_speed_10m?.[0] != null ? Math.round(data.hourly.wind_speed_10m[0]) : null,
      windDir: data.hourly?.wind_direction_10m?.[0] != null ? Math.round(data.hourly.wind_direction_10m[0]) : null,
      precip1h: data.hourly?.precipitation?.[0] ?? 0,
      weatherCode: data.hourly?.weather_code?.[0] ?? 3,
      updatedAt: new Date().toISOString(),
    };

    // Hourly (next 24h)
    const hourlyCount = Math.min(24, data.hourly?.time?.length || 0);
    const hourly = [];
    for (let i = 0; i < hourlyCount; i++) {
      hourly.push({
        time: data.hourly.time[i],
        temp: Math.round(data.hourly.temperature_2m[i] ?? 0),
        wind: Math.round(data.hourly.wind_speed_10m[i] ?? 0),
        windDir: Math.round(data.hourly.wind_direction_10m[i] ?? 0),
        precip: data.hourly.precipitation[i] ?? 0,
        snow: data.hourly.snowfall[i] ?? 0,
        weatherCode: data.hourly.weather_code[i] ?? 3,
      });
    }

    // Daily
    const dailyCount = data.daily?.time?.length || 0;
    const daily = [];
    for (let i = 0; i < dailyCount; i++) {
      daily.push({
        date: data.daily.time[i],
        tempMax: Math.round(data.daily.temperature_2m_max[i] ?? 0),
        tempMin: Math.round(data.daily.temperature_2m_min[i] ?? 0),
        precip: Math.round((data.daily.precipitation_sum[i] ?? 0) * 10) / 10,
        snow: Math.round((data.daily.snowfall_sum[i] ?? 0) * 10) / 10,
        wind: Math.round(data.daily.wind_speed_10m_max[i] ?? 0),
        windGust: Math.round(data.daily.wind_gusts_10m_max[i] ?? 0),
        windDir: Math.round(data.daily.wind_direction_10m_dominant[i] ?? 0),
        weatherCode: data.daily.weather_code[i] ?? 3,
      });
    }

    const result = {
      source: "meteoswiss",
      sourceName: "MeteoSwiss (ICON)",
      updatedAt: new Date().toISOString(),
      location: { lat: parseFloat(lat), lon: parseFloat(lon) },
      now: nowHour,
      hourly,
      daily,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  } catch (error) {
    console.error("Weather MeteoSwiss error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
