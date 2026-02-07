import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Gather data for analysis
    const [eventsRes, tokensRes, profilesRes] = await Promise.all([
      sb.from("shot_events").select("*").order("created_at", { ascending: false }).limit(50),
      sb.from("shot_tokens").select("*"),
      sb.from("profiles").select("id, nickname, full_name, email, is_active"),
    ]);

    const events = eventsRes.data ?? [];
    const tokens = tokensRes.data ?? [];
    const profiles = profilesRes.data ?? [];

    // Fetch the DB functions source code for the AI to audit
    const { data: fnSources } = await sb.rpc("rpc_get_shot_leaderboard", { p_group_id: "global", p_days: 9999 });

    // Build profile map
    const profileMap: Record<string, string> = {};
    profiles.forEach((p: any) => { profileMap[p.id] = p.nickname || p.full_name || p.email; });

    // Build stats summary
    const selectionCounts: Record<string, number> = {};
    const startCounts: Record<string, number> = {};
    events.forEach((e: any) => {
      if (e.selected_user_id) selectionCounts[e.selected_user_id] = (selectionCounts[e.selected_user_id] || 0) + 1;
      if (e.started_by) startCounts[e.started_by] = (startCounts[e.started_by] || 0) + 1;
    });

    const lastEvent = events[0];
    const lastUpdate = lastEvent ? lastEvent.created_at : "Ingen runder ennå";

    const dataForAi = {
      total_rounds: events.length,
      last_round_date: lastUpdate,
      selection_distribution: Object.entries(selectionCounts).map(([uid, count]) => ({
        user: profileMap[uid] || uid,
        times_selected: count,
      })),
      starter_distribution: Object.entries(startCounts).map(([uid, count]) => ({
        user: profileMap[uid] || uid,
        times_started: count,
      })),
      token_balances: tokens.map((t: any) => ({
        user: profileMap[t.user_id] || t.user_id,
        balance: t.balance,
        last_refill: t.last_refill_at,
      })),
      active_users: profiles.filter((p: any) => p.is_active).length,
      total_profiles: profiles.length,
      leaderboard: fnSources,
      algorithm_description: `
        The selection algorithm uses weighted random selection.
        Each active user gets a weight of 1/(1 + recent_selections_in_7_days).
        This means users who have been selected recently have a LOWER chance of being selected again.
        The admin has NO special privileges in the selection.
        All users are treated equally based on their selection history.
        Tokens: Each user starts with 5, gets +1 per day (max 5). Starting a round costs 1 token.
        There is a 5-minute cooldown between rounds.
      `,
    };

    const prompt = `Du er en uavhengig, nøytral rettferdighets-revisor for et "Shoot your shot"-spill.
Din jobb er å analysere spilldata og algoritmen for å avdekke enhver form for bias, favorisering eller urettferdighet.

Her er spilldata og algoritmebeskrivelse:
${JSON.stringify(dataForAi, null, 2)}

Analyser følgende og gi en NORSK rapport:
1. **Algoritmevurdering**: Er vektingsalgoritmen rettferdig? Kan noen manipulere den?
2. **Utvalgsfordeling**: Er det statistisk mistenkelige avvik i hvem som blir valgt?
3. **Token-fordeling**: Er token-balansene rettferdige og konsistente?
4. **Admin-sjekk**: Er det tegn på at noen bruker (spesielt admin/oppretteren) unngår å bli valgt?
5. **Siste oppdatering**: Når skjedde siste runde, og hva var resultatet?
6. **Samlet dom**: Gi en overordnet vurdering (✅ Rettferdig / ⚠️ Mulig skjevhet / ❌ Urettferdighet funnet)

Vær ærlig, direkte og kort. Maks 300 ord. Bruk norsk.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du er en uavhengig revisor som sjekker rettferdighet i spill. Svar kun på norsk." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "For mange forespørsler, prøv igjen om litt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Kreditter oppbrukt." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResp.json();
    const report = aiData.choices?.[0]?.message?.content || "Kunne ikke generere rapport.";

    return new Response(JSON.stringify({
      report,
      last_update: lastUpdate,
      total_rounds: events.length,
      active_users: profiles.filter((p: any) => p.is_active).length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("shot-fairness-check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
