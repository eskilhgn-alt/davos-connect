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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
    const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID")!;
    const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY")!;

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
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check admin
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Only admin can draw roomies" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action; // "draw" or "finalize"

    if (action === "draw") {
      // Get all active users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .eq("is_active", true)
        .eq("is_banned", false);

      if (!profiles || profiles.length < 2) {
        return new Response(JSON.stringify({ error: "Need at least 2 users" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const names = profiles.map(p => ({
        id: p.id,
        name: p.nickname || p.full_name || "Ukjent",
      }));

      // Call OpenAI to pair users randomly
      const prompt = `Du er en romfordeler for en vennegjeng på skitur. Her er deltakerne:
${names.map(n => `- ${n.name} (id: ${n.id})`).join('\n')}

Del dem opp i rom-par (2 per rom). Hvis det er et oddetall, lag én gruppe med 3.
Svar BARE med JSON-array, ingen annen tekst:
[{"room": 1, "members": [{"id": "uuid", "name": "Navn"}, {"id": "uuid", "name": "Navn"}]}, ...]`;

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 1.2, // High randomness
          max_tokens: 1000,
        }),
      });

      const openaiData = await openaiRes.json();
      const rawContent = openaiData.choices?.[0]?.message?.content || "[]";
      
      // Extract JSON from response
      let pairs;
      try {
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        pairs = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        pairs = [];
      }

      if (pairs.length === 0) {
        return new Response(JSON.stringify({ error: "Could not generate pairs" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create draw with countdown
      const countdownEndsAt = new Date(Date.now() + 15000).toISOString(); // 15 seconds
      const { data: draw, error: insertErr } = await supabase
        .from("roomie_draws")
        .insert({
          created_by: user.id,
          status: "countdown",
          pairs,
          countdown_ends_at: countdownEndsAt,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Send push: "Roomie-trekning starter!"
      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("user_id")
        .not("player_id", "is", null);

      const userIds = [...new Set((tokens || []).map(t => t.user_id))];

      if (userIds.length > 0) {
        await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_aliases: { external_id: userIds },
            target_channel: "push",
            headings: { en: "🏠 Roomie-trekning!" },
            contents: { en: "Romfordelingen starter om 15 sekunder…" },
            url: "https://guttahutte.lovable.app/roomies",
            ios_badgeType: "Increase",
            ios_badgeCount: 1,
          }),
        });
      }

      return new Response(JSON.stringify({ success: true, draw }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "finalize") {
      const drawId = body.draw_id;
      if (!drawId) {
        return new Response(JSON.stringify({ error: "Missing draw_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update status to published
      const { data: draw, error: updateErr } = await supabase
        .from("roomie_draws")
        .update({ status: "published" })
        .eq("id", drawId)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Build pairs message
      const pairs = (draw.pairs as any[]) || [];
      const pairText = pairs.map((p: any) =>
        `Rom ${p.room}: ${p.members.map((m: any) => m.name).join(" & ")}`
      ).join("\n");

      // Push to all users
      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("user_id")
        .not("player_id", "is", null);

      const userIds = [...new Set((tokens || []).map(t => t.user_id))];

      if (userIds.length > 0) {
        await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_aliases: { external_id: userIds },
            target_channel: "push",
            headings: { en: "🏠 Romfordelingen er klar!" },
            contents: { en: pairText },
            url: "https://guttahutte.lovable.app/roomies",
            ios_badgeType: "Increase",
            ios_badgeCount: 1,
          }),
        });
      }

      return new Response(JSON.stringify({ success: true, draw }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset") {
      // Delete all draws
      await supabase.from("roomie_draws").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
