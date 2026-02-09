/**
 * award-points — Edge function to calculate and award points based on activity
 * 
 * Point values:
 * - Chat message: 1 point
 * - Media share (image/video/gif): 3 points
 * - Shot round started: 3 points
 * - Shot confirmed (took the shot): 4 points
 * - Witness activity (confirmed/denied, not timeout): 1 point
 * - Story published: 2 points
 * - Ski vertical 100m+: 2 points per 100m
 * 
 * Supports CRON_SECRET header for cron-based invocation.
 * Includes deduplication: checks last run time to avoid double-counting.
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
    // Auth: accept either CRON_SECRET header or valid JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      // Cron invocation - OK
    } else if (authHeader?.startsWith("Bearer ")) {
      // JWT check
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify admin
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceKey);
      const userId = claimsData.claims.sub as string;
      const { data: isAdmin } = await adminClient.rpc("is_admin", { _user_id: userId });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Deduplication: check when points were last awarded
    const { data: lastAward } = await sb
      .from("points_ledger")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastAwardTime = lastAward && lastAward.length > 0
      ? new Date(lastAward[0].created_at).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Use the later of: last award time or 24h ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since = lastAwardTime > twentyFourHoursAgo ? lastAwardTime : twentyFourHoursAgo;

    console.log(`Awarding points for activity since: ${since}`);

    const awards: { user_id: string; points: number; reason: string; desc: string }[] = [];

    // 1. Chat messages (1 point each)
    const { data: messages } = await sb
      .from("messages")
      .select("sender_id")
      .gte("created_at", since)
      .is("deleted_at", null);
    
    if (messages) {
      const counts = new Map<string, number>();
      messages.forEach((m: any) => counts.set(m.sender_id, (counts.get(m.sender_id) || 0) + 1));
      counts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count, reason: "chat_message", desc: `${count} meldinger` });
      });
    }

    // 2. Media shares (3 points each)
    const { data: attachments } = await sb
      .from("gallery_items")
      .select("uploaded_by")
      .gte("created_at", since);
    
    if (attachments) {
      const counts = new Map<string, number>();
      attachments.forEach((a: any) => counts.set(a.uploaded_by, (counts.get(a.uploaded_by) || 0) + 1));
      counts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count * 3, reason: "media_share", desc: `${count} bilder/videoer` });
      });
    }

    // 3. Shot rounds started (3 points) + confirmed (4 points) + witness activity (1 point)
    const { data: shotEvents } = await sb
      .from("shot_events")
      .select("started_by, selected_user_id, witness_confirmed_by, status")
      .gte("created_at", since);
    
    if (shotEvents) {
      const startCounts = new Map<string, number>();
      const confirmCounts = new Map<string, number>();
      const witnessCounts = new Map<string, number>();
      
      shotEvents.forEach((e: any) => {
        startCounts.set(e.started_by, (startCounts.get(e.started_by) || 0) + 1);
        if (e.status === "confirmed" && e.selected_user_id) {
          confirmCounts.set(e.selected_user_id, (confirmCounts.get(e.selected_user_id) || 0) + 1);
        }
      });

      // Witness gets point for active participation (confirmed or disputed, NOT timeout)
      const { data: logEntries } = await sb
        .from("shot_event_log")
        .select("actor_id, type")
        .in("type", ["witness_confirmed", "witness_disputed"])
        .gte("created_at", since);
      
      if (logEntries) {
        logEntries.forEach((l: any) => {
          if (l.actor_id) {
            witnessCounts.set(l.actor_id, (witnessCounts.get(l.actor_id) || 0) + 1);
          }
        });
      }

      startCounts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count * 3, reason: "shot_start", desc: `${count} runder startet` });
      });
      confirmCounts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count * 4, reason: "shot_confirm", desc: `${count} shots bekreftet` });
      });
      witnessCounts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count, reason: "witness", desc: `${count} vitneaktiviteter` });
      });
    }

    // 4. Stories published (2 points)
    const { data: stories } = await sb
      .from("stories")
      .select("user_id")
      .gte("created_at", since);
    
    if (stories) {
      const counts = new Map<string, number>();
      stories.forEach((s: any) => counts.set(s.user_id, (counts.get(s.user_id) || 0) + 1));
      counts.forEach((count, userId) => {
        awards.push({ user_id: userId, points: count * 2, reason: "story_publish", desc: `${count} stories` });
      });
    }

    // 5. Ski vertical (2 points per 100m)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayStr = yesterday.toISOString().split("T")[0];
    
    const { data: skiData } = await sb
      .from("ski_daily_vertical")
      .select("user_id, vertical_meters")
      .eq("day_date", dayStr);
    
    if (skiData) {
      skiData.forEach((s: any) => {
        const points = Math.floor(s.vertical_meters / 100) * 2;
        if (points > 0) {
          awards.push({ user_id: s.user_id, points, reason: "ski_vertical", desc: `${Math.round(s.vertical_meters)}m høydemeter` });
        }
      });
    }

    // Apply all awards
    let totalAwarded = 0;
    for (const award of awards) {
      await sb.rpc("rpc_award_points", {
        p_user_id: award.user_id,
        p_points: award.points,
        p_reason: award.reason,
        p_description: award.desc,
      });
      totalAwarded += award.points;
    }

    // === Compute and store streaks for all users (batched) ===
    const { data: allProfiles } = await sb.from("profiles").select("id").eq("is_active", true);
    let streaksUpdated = 0;
    
    if (allProfiles) {
      for (const profile of allProfiles) {
        const uid = profile.id;
        try {
          const [msgRes, galRes, shotRes, storyRes] = await Promise.all([
            sb.from("messages").select("created_at").eq("sender_id", uid).is("deleted_at", null).order("created_at", { ascending: false }).limit(365),
            sb.from("gallery_items").select("created_at").eq("uploaded_by", uid).order("created_at", { ascending: false }).limit(100),
            sb.from("shot_events").select("created_at").or(`started_by.eq.${uid},selected_user_id.eq.${uid},witness_confirmed_by.eq.${uid}`).order("created_at", { ascending: false }).limit(100),
            sb.from("stories").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
          ]);

          const activeDays = new Set<string>();
          const addDates = (rows: any[] | null) => rows?.forEach((r: any) => activeDays.add(r.created_at.split("T")[0]));
          addDates(msgRes.data);
          addDates(galRes.data);
          addDates(shotRes.data);
          addDates(storyRes.data);

          const sorted = Array.from(activeDays).sort().reverse();
          const today = new Date().toISOString().split("T")[0];
          const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

          let streak = 0;
          const checkDate = activeDays.has(today) ? today : (activeDays.has(yesterdayStr) ? yesterdayStr : null);
          if (checkDate) {
            const d = new Date(checkDate);
            while (activeDays.has(d.toISOString().split("T")[0])) {
              streak++;
              d.setDate(d.getDate() - 1);
            }
          }

          let best = 0, cur = 1;
          for (let i = 1; i < sorted.length; i++) {
            const diff = (new Date(sorted[i - 1]).getTime() - new Date(sorted[i]).getTime()) / 86400000;
            if (Math.round(diff) === 1) cur++;
            else { best = Math.max(best, cur); cur = 1; }
          }
          best = Math.max(best, cur, streak);

          await sb.from("user_streaks").upsert({
            user_id: uid,
            current_streak: streak,
            best_streak: best,
            last_active_date: sorted[0] || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          streaksUpdated++;
        } catch (e) {
          console.error(`Streak calc error for ${uid}:`, e);
        }
      }
    }

    console.log(`Awards: ${awards.length}, Points: ${totalAwarded}, Streaks: ${streaksUpdated}`);

    return new Response(
      JSON.stringify({ success: true, awards_count: awards.length, total_points: totalAwarded, streaks_updated: streaksUpdated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Award points error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
