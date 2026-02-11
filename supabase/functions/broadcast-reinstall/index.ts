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
    // Resend removed – email not used
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    // Auth check – admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: authUser.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Not admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { heading, message } = await req.json();
    if (!heading || !message) {
      return new Response(JSON.stringify({ error: "Missing heading/message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Create popup announcement
    await supabase.from("system_announcements").insert({
      message,
      type: "popup",
      created_by: authUser.id,
    });

    // 2. Get all active users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("is_active", true);

    const allUsers = profiles || [];
    let pushSent = 0;
    

    // 3. Send push via OneSignal
    if (ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY) {
      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("user_id")
        .not("player_id", "is", null);

      const pushUserIds = [...new Set((tokens || []).map((t: any) => t.user_id))];

      if (pushUserIds.length > 0) {
        const pushRes = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_aliases: { external_id: pushUserIds },
            target_channel: "push",
            headings: { en: heading },
            contents: { en: message },
            url: "https://guttahutte.lovable.app/hjem",
            ios_badgeType: "Increase",
            ios_badgeCount: 1,
          }),
        });
        if (pushRes.ok) pushSent = pushUserIds.length;
      }
    }

    // Email sending removed – all notifications via push only

    // 5. Log action
    await supabase.from("admin_audit_log").insert({
      admin_id: authUser.id,
      action: "broadcast_reinstall",
      details: { heading, message, push_sent: pushSent },
    });

    return new Response(
      JSON.stringify({ success: true, push_sent: pushSent, popup_created: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("broadcast-reinstall error:", error);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
