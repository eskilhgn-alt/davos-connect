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

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Missing env vars");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { buyer_id, drink_type, participant_ids, drink_quantities, is_treated } = await req.json();

    if (!buyer_id || !participant_ids?.length) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get buyer name
    const { data: buyerProfile } = await supabase.from("profiles").select("nickname, full_name").eq("id", buyer_id).single();
    const buyerName = buyerProfile?.nickname || buyerProfile?.full_name || "Noen";

    // Build drink summary from quantities
    const drinkLabels: Record<string, string> = { beer: "øl", drink: "drinker" };
    let drinkSummary = drinkLabels[drink_type] || drink_type;
    if (drink_quantities && typeof drink_quantities === "object") {
      const parts: string[] = [];
      if (drink_quantities.beer) parts.push(`${drink_quantities.beer} øl`);
      if (drink_quantities.drink) parts.push(`${drink_quantities.drink} drinker`);
      if (parts.length > 0) drinkSummary = parts.join(", ");
    }

    // ALL participants get push (including buyer)
    const recipientIds = [...participant_ids];
    // Also include buyer if not already in the list
    if (!recipientIds.includes(buyer_id)) {
      recipientIds.push(buyer_id);
    }

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get push tokens
    const { data: tokens } = await supabase.from("push_tokens").select("user_id").in("user_id", recipientIds).not("player_id", "is", null);
    const externalUserIds = (tokens || []).map((t: any) => t.user_id);

    if (externalUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No push tokens" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Differentiate spandert vs lagt ut
    const isTreated = is_treated === true;
    const heading = isTreated ? "🎁 Spandert runde!" : "🍻 Lagt ut for runde!";
    const message = isTreated
      ? `${buyerName} spanderer ${drinkSummary}!`
      : `${buyerName} har lagt ut for ${drinkSummary}`;

    const notification = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: externalUserIds },
      target_channel: "push",
      headings: { en: heading },
      contents: { en: message },
      url: "https://guttahutte.lovable.app/runder",
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    };

    const response = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Key ${ONESIGNAL_REST_API_KEY}` },
      body: JSON.stringify(notification),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));

    return new Response(JSON.stringify({ success: true, sent: externalUserIds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("round-push error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
