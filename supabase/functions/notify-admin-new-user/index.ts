import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = Deno.env.get("APP_URL") || "https://guttahutte.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserEmail = userData.user.email || "ukjent";

    // Find all admin user IDs
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ sent: false, reason: "no_admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map((r) => r.user_id);

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error("OneSignal not configured");
      return new Response(JSON.stringify({ sent: false, reason: "onesignal_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dedupeKey = `new-user:${userData.user.id}`;
    const { error: claimError } = await supabaseAdmin.from("notification_dispatches").insert({
      dedupe_key: dedupeKey,
      kind: "admin_new_user",
      source_id: userData.user.id,
      event_type: "registered",
    });
    if (claimError?.code === "23505") {
      return new Response(JSON.stringify({ sent: false, reason: "already_dispatched" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (claimError) throw claimError;

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: adminIds },
      target_channel: "push",
      headings: { en: "Ny bruker registrert 🆕" },
      contents: { en: `${newUserEmail} venter på e-postverifisering. Gå til Admin → Brukere for å verifisere.` },
      url: `${APP_URL}/admin`,
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
    if (!response.ok) {
      console.error("OneSignal error:", result);
      await supabaseAdmin.from("notification_dispatches").delete().eq("dedupe_key", dedupeKey);
      return new Response(JSON.stringify({ sent: false, reason: "onesignal_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin
      .from("notification_dispatches")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("dedupe_key", dedupeKey);

    return new Response(JSON.stringify({ sent: true, admins: adminIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-admin-new-user error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
