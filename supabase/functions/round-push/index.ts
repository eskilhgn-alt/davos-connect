import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
  const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    console.error("round-push: missing environment variables");
    return json({ error: "Server configuration error" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let roundId = "";
  try {
    const body = await req.json();
    roundId = typeof body?.round_id === "string" ? body.round_id : "";
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roundId)) {
    return json({ error: "Invalid round_id" }, 400);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();

  // The database, not the request body, is the source of truth. Only the
  // buyer can claim a notification, and concurrent/retried calls get no row.
  const { data: round, error: claimError } = await service
    .from("rounds")
    .update({ push_claimed_at: claimedAt })
    .eq("id", roundId)
    .eq("buyer_id", user.id)
    .is("push_sent_at", null)
    .or(`push_claimed_at.is.null,push_claimed_at.lt.${staleBefore}`)
    .select("id, buyer_id, drink_type, drink_quantities, is_treated")
    .maybeSingle();

  if (claimError) {
    console.error("round-push claim failed", claimError);
    return json({ error: "Could not claim notification" }, 500);
  }
  if (!round) return json({ success: true, duplicate: true, sent: 0 });

  const releaseClaim = async () => {
    await service.from("rounds").update({ push_claimed_at: null })
      .eq("id", roundId).eq("push_claimed_at", claimedAt).is("push_sent_at", null);
  };

  try {
    const [{ data: buyerProfile, error: buyerError }, { data: participants, error: participantError }] = await Promise.all([
      service.from("profiles").select("nickname, full_name").eq("id", round.buyer_id).single(),
      service.from("round_participants").select("user_id").eq("round_id", round.id),
    ]);
    if (buyerError || participantError) throw buyerError || participantError;

    const recipientIds = Array.from(new Set((participants || [])
      .map((p: { user_id: string }) => p.user_id)
      .filter((id: string) => id && id !== round.buyer_id)));

    const { data: tokens, error: tokenError } = recipientIds.length
      ? await service.from("push_tokens").select("user_id").in("user_id", recipientIds).not("player_id", "is", null)
      : { data: [], error: null };
    if (tokenError) throw tokenError;
    const externalUserIds = Array.from(new Set((tokens || []).map((t: { user_id: string }) => t.user_id)));

    if (externalUserIds.length > 0) {
      const quantities = (round.drink_quantities || {}) as Record<string, number>;
      const labels: Record<string, string> = {
        beer: "øl", drink: "drinker", food: "mat", grocery: "dagligvarer",
      };
      const parts = Object.entries(quantities)
        .filter(([, amount]) => Number(amount) > 0)
        .map(([kind, amount]) => `${amount} ${labels[kind] || kind}`);
      const summary = parts.length ? parts.join(", ") : labels[round.drink_type] || round.drink_type;
      const buyerName = buyerProfile?.nickname || buyerProfile?.full_name || "Noen";
      const treated = round.is_treated === true;

      const response = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_aliases: { external_id: externalUserIds },
          target_channel: "push",
          headings: { en: treated ? "🎁 Spandert!" : "🍻 Ny runde" },
          contents: { en: treated ? `${buyerName} spanderer ${summary}!` : `${buyerName} har lagt ut for ${summary}` },
          url: "https://guttahutte.lovable.app/runder",
          ios_badgeType: "Increase",
          ios_badgeCount: 1,
        }),
      });
      if (!response.ok) throw new Error(`OneSignal ${response.status}: ${await response.text()}`);
    }

    const { error: sentError } = await service.from("rounds")
      .update({ push_sent_at: new Date().toISOString(), push_claimed_at: null })
      .eq("id", roundId).eq("push_claimed_at", claimedAt);
    if (sentError) throw sentError;
    return json({ success: true, sent: externalUserIds.length });
  } catch (error) {
    console.error("round-push error", error);
    await releaseClaim();
    return json({ error: "Notification failed" }, 500);
  }
});
