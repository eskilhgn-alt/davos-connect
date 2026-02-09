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
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
        // Witness gets point for active participation (confirmed or denied/disputed, NOT timeout)
        if (e.witness_confirmed_by && e.status !== "punished") {
          witnessCounts.set(e.witness_confirmed_by, (witnessCounts.get(e.witness_confirmed_by) || 0) + 1);
        }
      });

      // Also check log for witness_disputed entries (active denial = point)
      const { data: logEntries } = await sb
        .from("shot_event_log")
        .select("actor_id, type")
        .in("type", ["witness_confirmed", "witness_disputed"])
        .gte("created_at", since);
      
      if (logEntries) {
        logEntries.forEach((l: any) => {
          if (l.actor_id && !witnessCounts.has(l.actor_id)) {
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

    return new Response(
      JSON.stringify({ success: true, awards_count: awards.length, total_points: totalAwarded }),
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
