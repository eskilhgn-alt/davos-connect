import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushPayload {
  thread_id: string;
  sender_id: string;
  message_id: string;
}

const APP_URL = Deno.env.get("APP_URL") || "https://guttahutte.lovable.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) throw new Error("OneSignal credentials not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) throw new Error("Supabase credentials not configured");

    // JWT check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = authUser.id;

    const body = (await req.json()) as PushPayload;
    const { thread_id, sender_id, message_id } = body || {} as PushPayload;
    if (!thread_id || !sender_id || !message_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce caller identity matches sender
    if (callerUserId !== sender_id) {
      return new Response(JSON.stringify({ error: "Forbidden: sender mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load the message server-side (do not trust client-provided preview/sender_name)
    const { data: msgRow, error: msgErr } = await supabase
      .from("messages")
      .select("id, text, sender_id, sender_name, thread_id, deleted_at, attachments")
      .eq("id", message_id)
      .single();
    if (msgErr || !msgRow) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msgRow.deleted_at) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msgRow.sender_id !== sender_id || msgRow.thread_id !== thread_id) {
      return new Response(JSON.stringify({ error: "Message ownership/thread mismatch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve sender display name from profile as source of truth
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("nickname, full_name, email")
      .eq("id", sender_id)
      .maybeSingle();
    const senderName =
      senderProfile?.nickname || senderProfile?.full_name || msgRow.sender_name || "Ny melding";

    // Build preview
    const attCount = Array.isArray(msgRow.attachments) ? (msgRow.attachments as unknown[]).length : 0;
    let preview = (msgRow.text as string) || "";
    if (!preview && attCount > 0) {
      preview = attCount === 1 ? "📎 Vedlegg" : `📎 ${attCount} vedlegg`;
    }
    if (preview.length > 100) preview = preview.substring(0, 97) + "...";
    if (!preview) preview = "Ny melding";

    // Recipient user_ids from push_tokens (single source of truth). Exclude sender.
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("user_id")
      .not("player_id", "is", null);
    const externalUserIds = Array.from(
      new Set(((tokens || []).map((t: { user_id: string }) => t.user_id)))
    ).filter((uid) => uid !== sender_id);

    if (externalUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: externalUserIds },
      target_channel: "push",
      headings: { en: senderName },
      contents: { en: preview },
      url: `${APP_URL}/chat?message=${encodeURIComponent(message_id)}`,
      data: { thread_id, message_id, kind: "chat" },
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
      collapse_id: `thread_${thread_id}`,
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
      console.error("OneSignal API error:", result);
      throw new Error(`OneSignal API error: ${JSON.stringify(result)}`);
    }

    return new Response(
      JSON.stringify({ success: true, sent: externalUserIds.length, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-push-notification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
