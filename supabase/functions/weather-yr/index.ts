/**
 * Weather Yr Edge Function
 * Fetches forecast from MET Norway locationforecast 2.0
 * Returns normalized format: { now, hourly[], daily[] }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface YrTimeseries {
  time: string;
  data: {
    instant: {
      details: {
        air_temperature: number;
        wind_speed: number;
        wind_from_direction: number;
        relative_humidity?: number;
        air_pressure_at_sea_level?: number;
      };
    };
    next_1_hours?: {
      summary: { symbol_code: string };
      details: { precipitation_amount: number };
    };
    next_6_hours?: {
      summary: { symbol_code: string };
      details: { precipitation_amount: number };
    };
  };
}

function yrSymbolToWmo(symbol: string): number {
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

function circularMean(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  let sinSum = 0, cosSum = 0;
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  let mean = (Math.atan2(sinSum / degrees.length, cosSum / degrees.length) * 180) / Math.PI;
  if (mean < 0) mean += 360;
  return Math.round(mean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat") || "46.80";
    const lon = url.searchParams.get("lon") || "9.84";

    const yrUrl = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;

    const response = await fetch(yrUrl, {
      headers: {
        "User-Agent": "Lift&Lager/1.0 (contact: eskilhgn@gmail.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`Yr API error: ${response.status}`);
    }

    const data = await response.json();
    const timeseries: YrTimeseries[] = data.properties?.timeseries || [];

    if (timeseries.length === 0) {
      throw new Error("No timeseries data from Yr");
    }

    // Current conditions
    const current = timeseries[0];
    const currentSymbol = current.data.next_1_hours?.summary?.symbol_code || 
                          current.data.next_6_hours?.summary?.symbol_code || "cloudy";
    
    const now = {
      temp: Math.round(current.data.instant.details.air_temperature),
      wind: Math.round(current.data.instant.details.wind_speed),
      windDir: Math.round(current.data.instant.details.wind_from_direction),
      precip1h: current.data.next_1_hours?.details?.precipitation_amount ?? 0,
      symbol: currentSymbol,
      weatherCode: yrSymbolToWmo(currentSymbol),
      updatedAt: current.time,
    };

    // Hourly (next 24h)
    const hourly = timeseries.slice(0, 24).map((ts) => {
      const sym = ts.data.next_1_hours?.summary?.symbol_code || 
                  ts.data.next_6_hours?.summary?.symbol_code || "cloudy";
      return {
        time: ts.time,
        temp: Math.round(ts.data.instant.details.air_temperature),
        wind: Math.round(ts.data.instant.details.wind_speed),
        windDir: Math.round(ts.data.instant.details.wind_from_direction),
        precip: ts.data.next_1_hours?.details?.precipitation_amount ?? 0,
        symbol: sym,
        weatherCode: yrSymbolToWmo(sym),
      };
    });

    // Daily aggregation (up to 7 days)
    const dailyMap = new Map<string, {
      temps: number[];
      precip: number;
      wind: number[];
      windDir: number[];
      codes: number[];
    }>();

    for (const ts of timeseries) {
      const date = ts.time.split("T")[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { temps: [], precip: 0, wind: [], windDir: [], codes: [] });
      }
      const day = dailyMap.get(date)!;
      const inst = ts.data.instant.details;

      day.temps.push(inst.air_temperature);
      day.wind.push(inst.wind_speed);
      day.windDir.push(inst.wind_from_direction);
      
      if (ts.data.next_1_hours?.details?.precipitation_amount !== undefined) {
        day.precip += ts.data.next_1_hours.details.precipitation_amount;
      }
      
      const sym = ts.data.next_1_hours?.summary?.symbol_code || 
                  ts.data.next_6_hours?.summary?.symbol_code;
      if (sym) day.codes.push(yrSymbolToWmo(sym));
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    const daily = sortedDates.slice(0, 7).map((date) => {
      const d = dailyMap.get(date)!;
      const maxTemp = Math.round(Math.max(...d.temps));
      const minTemp = Math.round(Math.min(...d.temps));
      const maxWind = Math.round(Math.max(...d.wind));
      const isSnowLikely = minTemp < 2;
      
      // Most frequent weather code
      const codeCounts = new Map<number, number>();
      for (const c of d.codes) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
      let topCode = 3;
      let topCount = 0;
      for (const [code, count] of codeCounts) {
        if (count > topCount) { topCode = code; topCount = count; }
      }

      return {
        date,
        tempMax: maxTemp,
        tempMin: minTemp,
        precip: Math.round(d.precip * 10) / 10,
        snow: isSnowLikely ? Math.round(d.precip * 10) / 10 : 0,
        wind: maxWind,
        windDir: circularMean(d.windDir),
        weatherCode: topCode,
      };
    });

    const result = {
      source: "yr",
      sourceName: "Yr (MET Norway)",
      updatedAt: new Date().toISOString(),
      location: { lat: parseFloat(lat), lon: parseFloat(lon) },
      now,
      hourly,
      daily,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    console.error("Weather Yr error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
