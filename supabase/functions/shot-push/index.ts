import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error("OneSignal credentials not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // AUTH CHECK
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { type, heading, message, exclude_user_id, url, include_user_ids } = await req.json();

    if (!type || !heading || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let externalUserIds: string[];

    if (include_user_ids && Array.isArray(include_user_ids) && include_user_ids.length > 0) {
      // Targeted push to specific users
      externalUserIds = include_user_ids;
    } else {
      // Broadcast: get all users with push tokens
      let query = supabase
        .from("push_tokens")
        .select("user_id, player_id")
        .not("player_id", "is", null);

      if (exclude_user_id) {
        query = query.neq("user_id", exclude_user_id);
      }

      const { data: tokens, error: tokensError } = await query;
      if (tokensError) throw tokensError;

      const seen = new Set<string>();
      externalUserIds = (tokens || [])
        .filter((t) => {
          if (seen.has(t.user_id)) return false;
          seen.add(t.user_id);
          return true;
        })
        .map((t) => t.user_id);
    }

    if (externalUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: externalUserIds },
      target_channel: "push",
      headings: { en: heading },
      contents: { en: message },
      url: url || "https://davos-joy-connect.lovable.app/shot",
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    };

    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, sent: externalUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
