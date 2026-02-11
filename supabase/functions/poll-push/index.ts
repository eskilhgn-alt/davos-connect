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
      throw new Error("Missing environment variables");
    }

    // Auth check
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

    const { poll_id, type } = await req.json();
    if (!poll_id || !type) {
      return new Response(JSON.stringify({ error: "Missing poll_id or type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get poll
    const { data: poll } = await supabase.from("polls").select("*").eq("id", poll_id).single();
    if (!poll) throw new Error("Poll not found");

    // Authorization: only poll creator (or admin) can trigger push
    const isCreator = callerUserId === poll.created_by;
    const { data: isAdminUser } = await supabase.rpc("is_admin", { _user_id: callerUserId });
    if (!isCreator && !isAdminUser) {
      return new Response(JSON.stringify({ error: "Forbidden: only poll creator or admin can send push" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get creator profile
    const { data: creator } = await supabase.from("profiles").select("nickname, full_name").eq("id", poll.created_by).single();
    const creatorName = creator?.nickname || creator?.full_name || "Noen";

    let heading = "";
    let content = "";
    let targetUserIds: string[] = [];

    if (type === "created") {
      heading = "📊 Ny avstemming";
      content = `${creatorName}: ${poll.question}`;
      
      // All users except creator
      const { data: pushTokenUsers } = await supabase
        .from("push_tokens")
        .select("user_id")
        .neq("user_id", callerUserId)
        .not("player_id", "is", null);
      targetUserIds = (pushTokenUsers || []).map((p) => p.user_id);

    } else if (type === "resolved") {
      // Get winning option label
      const { data: winOpt } = await supabase
        .from("poll_options")
        .select("label")
        .eq("id", poll.winning_option_id)
        .single();

      heading = "✅ Avstemming avgjort";
      content = `${poll.question} → ${winOpt?.label || "Ukjent"}`;

      // All users
      const { data: pushTokenUsers } = await supabase
        .from("push_tokens")
        .select("user_id")
        .not("player_id", "is", null);
      targetUserIds = (pushTokenUsers || []).map((p) => p.user_id);

    } else if (type === "cancelled") {
      heading = "❌ Avstemming kansellert";
      content = `${creatorName} kansellerte: ${poll.question}`;

      const { data: pushTokenUsers } = await supabase
        .from("push_tokens")
        .select("user_id")
        .neq("user_id", callerUserId)
        .not("player_id", "is", null);
      targetUserIds = (pushTokenUsers || []).map((p) => p.user_id);

    } else if (type === "reminder") {
      heading = "⏰ Påminnelse: Stem nå!";
      content = poll.question;

      // Only users who haven't voted
      const { data: votes } = await supabase
        .from("poll_votes")
        .select("user_id")
        .eq("poll_id", poll_id);
      const voterIds = new Set((votes || []).map((v) => v.user_id));

      const { data: pushTokenUsers } = await supabase
        .from("push_tokens")
        .select("user_id")
        .not("player_id", "is", null);
      targetUserIds = (pushTokenUsers || [])
        .map((p) => p.user_id)
        .filter((uid) => !voterIds.has(uid));
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: { external_id: targetUserIds },
      target_channel: "push",
      headings: { en: heading },
      contents: { en: content },
      url: `https://guttahutte.lovable.app/poll`,
      collapse_id: `poll_${poll_id}`,
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
    console.log(`Poll push (${type}) sent to ${targetUserIds.length} users:`, result);

    return new Response(
      JSON.stringify({ success: true, sent: targetUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Poll push error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
