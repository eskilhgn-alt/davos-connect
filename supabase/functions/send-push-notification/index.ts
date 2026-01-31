import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  thread_id: string;
  sender_id: string;
  sender_name: string;
  message_preview: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error("OneSignal credentials not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const payload: PushPayload = await req.json();
    const { thread_id, sender_id, sender_name, message_preview } = payload;

    if (!thread_id || !sender_id || !sender_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all members in the thread except the sender who have push tokens
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("user_id, push_token")
      .eq("thread_id", thread_id)
      .neq("user_id", sender_id)
      .not("push_token", "is", null);

    if (membersError) {
      console.error("Error fetching members:", membersError);
      throw membersError;
    }

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No recipients with push tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get external_user_ids (OneSignal uses these to target users)
    const externalUserIds = members
      .filter((m) => m.push_token)
      .map((m) => m.user_id);

    if (externalUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No valid push tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate message preview
    const preview = message_preview.length > 100 
      ? message_preview.substring(0, 97) + "..." 
      : message_preview;

    // Send notification via OneSignal
    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: externalUserIds,
      headings: { en: sender_name },
      contents: { en: preview || "Ny melding" },
      url: "/meldinger",
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
      // Debounce: collapse similar notifications
      collapse_id: `thread_${thread_id}`,
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(notificationPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("OneSignal API error:", result);
      throw new Error(`OneSignal API error: ${JSON.stringify(result)}`);
    }

    console.log("Push notification sent:", result);

    return new Response(
      JSON.stringify({ success: true, sent: externalUserIds.length, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending push notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
