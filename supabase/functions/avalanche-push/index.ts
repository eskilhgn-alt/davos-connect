/**
 * avalanche-push — Checks the SLF bulletin for danger level changes
 * and sends push notifications when danger is elevated (≥3) or increases.
 * Triggered by cron (e.g. every 6 hours).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_KEY = "avalanche-danger-last";

const DANGER_LABELS: Record<number, string> = {
  0: "Ikke vurdert", 1: "Liten", 2: "Moderat", 3: "Betydelig", 4: "Stor", 5: "Meget stor",
};

const DANGER_EMOJIS: Record<number, string> = {
  0: "⚪", 1: "🟢", 2: "🟡", 3: "🟠", 4: "🔴", 5: "⚫",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("authorization") || "";
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    
    // Also allow manual trigger from admin
    if (!isCron) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      // Check admin
      const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: user.id });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Not admin" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current bulletin via our own edge function
    const bulletinUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/avalanche-bulletin`;
    const bulletinRes = await fetch(bulletinUrl, {
      headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
    });

    if (!bulletinRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch bulletin" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const bulletin = await bulletinRes.json();
    const currentLevel = bulletin.overallMaxDanger || 0;

    // Get last known level from weather_cache
    const { data: cached } = await supabase
      .from("weather_cache")
      .select("payload")
      .eq("mountain_id", CACHE_KEY)
      .single();

    const lastLevel = (cached?.payload as any)?.danger_level ?? -1;

    // Update cache
    await supabase
      .from("weather_cache")
      .upsert({
        mountain_id: CACHE_KEY,
        payload: { danger_level: currentLevel, checked_at: new Date().toISOString() },
        generated_at: new Date().toISOString(),
      });

    // Decide if we should send push
    let shouldPush = false;
    let pushTitle = "";
    let pushBody = "";

    if (lastLevel === -1) {
      // First check ever — only push if danger is high
      if (currentLevel >= 3) {
        shouldPush = true;
      }
    } else if (currentLevel > lastLevel && currentLevel >= 3) {
      // Danger increased to 3+
      shouldPush = true;
    } else if (currentLevel >= 4 && lastLevel < 4) {
      // Jumped to 4+
      shouldPush = true;
    }

    if (shouldPush) {
      const emoji = DANGER_EMOJIS[currentLevel] || "⚠️";
      const label = DANGER_LABELS[currentLevel] || "Ukjent";

      pushTitle = `${emoji} Skredvarsel: ${label} fare (${currentLevel}/5)`;

      if (currentLevel >= 5) {
        pushBody = "Meget stor skredfare i Davos-området! Hold dere inne eller i sikrede områder. Naturlige skred forventes.";
      } else if (currentLevel >= 4) {
        pushBody = "Stor skredfare i Davos-området! Unngå alt bratt terreng utenfor preparerte løyper.";
      } else {
        pushBody = "Betydelig skredfare i Davos-området. Skred kan utløses av enkeltpersoner i bratt terreng. Vær forsiktige!";
      }

      // Send push via OneSignal
      const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
      const onesignalKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

      if (onesignalAppId && onesignalKey) {
        const pushRes = await fetch("https://onesignal.com/api/v1/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${onesignalKey}`,
          },
          body: JSON.stringify({
            app_id: onesignalAppId,
            included_segments: ["All"],
            headings: { en: pushTitle, no: pushTitle },
            contents: { en: pushBody, no: pushBody },
            url: "/skred",
            priority: 10,
            ttl: 21600, // 6 hours
          }),
        });

        const pushResult = await pushRes.json();
        console.log("Push sent:", pushResult);

        return new Response(JSON.stringify({
          pushed: true,
          currentLevel,
          previousLevel: lastLevel,
          title: pushTitle,
          body: pushBody,
          onesignal: pushResult,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      pushed: false,
      currentLevel,
      previousLevel: lastLevel,
      reason: shouldPush ? "no_onesignal_config" : "no_change_or_low_danger",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Avalanche push error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
