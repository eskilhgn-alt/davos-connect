/**
 * Weather Morning Push — Sends daily weather summary at 07:00 via OneSignal
 * Triggered by pg_cron
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Also allow regular auth
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      if (authHeader?.startsWith("Bearer ")) {
        const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const token = authHeader.replace("Bearer ", "");
        const { error } = await authClient.auth.getClaims(token);
        if (error) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return new Response(JSON.stringify({ error: "OneSignal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get today's AI weather summary
    const today = new Date().toISOString().split("T")[0];
    const { data: cached } = await supabase
      .from("weather_ai_daily")
      .select("ai_summary_today, ai_daily, confidence")
      .eq("location_id", "davos")
      .eq("day_date", today)
      .order("run_at", { ascending: false })
      .limit(1)
      .single();

    let message = "☀️ God morgen! Sjekk været i appen for oppdatert skirapport.";
    let heading = "Værvarsel Davos 🏔️";

    if (cached) {
      const summary = cached.ai_summary_today || "";
      const aiDaily = cached.ai_daily as Record<string, any>;
      const weather = aiDaily?.weather;
      const skiConditions = aiDaily?.skiConditions || "";

      if (summary) {
        // Truncate to ~200 chars for push
        message = summary.length > 200 ? summary.slice(0, 197) + "..." : summary;
      }
      if (skiConditions) {
        heading = `🏔️ ${skiConditions.slice(0, 50)}`;
      }
      if (weather) {
        const tempPart = weather.tempMax != null ? `${weather.tempMin}°/${weather.tempMax}°` : "";
        const snowPart = weather.snow > 0 ? ` ❄️ ${weather.snow}cm nysnø!` : "";
        const windPart = weather.wind ? ` 💨 ${weather.wind}m/s` : "";
        heading = `Davos: ${tempPart}${snowPart}${windPart}`;
      }
    }

    // Send push to all users via OneSignal
    const pushResponse = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ["Subscribed Users"],
        headings: { en: heading },
        contents: { en: message },
        url: "https://guttahutte.lovable.app/vaer",
      }),
    });

    const pushResult = await pushResponse.json();
    console.log("Morning push result:", JSON.stringify(pushResult));

    return new Response(
      JSON.stringify({ sent: true, heading, message: message.slice(0, 100) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("weather-morning-push error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
