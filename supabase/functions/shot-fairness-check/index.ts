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

    // Gather comprehensive data for analysis
    const [eventsRes, tokensRes, profilesRes, logRes] = await Promise.all([
      sb.from("shot_events").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("shot_tokens").select("*"),
      sb.from("profiles").select("id, nickname, full_name, email, is_active"),
      sb.from("shot_event_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    const events = eventsRes.data ?? [];
    const tokens = tokensRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const logs = logRes.data ?? [];

    // Fetch leaderboard
    const { data: leaderboard } = await sb.rpc("rpc_get_shot_leaderboard", { p_group_id: "global", p_days: 9999 });

    // Build profile map
    const profileMap: Record<string, string> = {};
    profiles.forEach((p: any) => { profileMap[p.id] = p.nickname || p.full_name || p.email; });

    // Detailed per-user stats
    const userStats: Record<string, {
      name: string;
      times_selected: number;
      times_started: number;
      times_confirmed: number;
      times_punished: number;
      times_witnessed: number;
      bonus_tokens: number;
      selection_dates: string[];
    }> = {};

    profiles.forEach((p: any) => {
      if (p.is_active) {
        userStats[p.id] = {
          name: p.nickname || p.full_name || p.email,
          times_selected: 0,
          times_started: 0,
          times_confirmed: 0,
          times_punished: 0,
          times_witnessed: 0,
          bonus_tokens: 0,
          selection_dates: [],
        };
      }
    });

    events.forEach((e: any) => {
      if (e.selected_user_id && userStats[e.selected_user_id]) {
        userStats[e.selected_user_id].times_selected++;
        userStats[e.selected_user_id].selection_dates.push(e.created_at);
        if (e.status === "confirmed") userStats[e.selected_user_id].times_confirmed++;
        if (e.status === "punished") userStats[e.selected_user_id].times_punished++;
      }
      if (e.started_by && userStats[e.started_by]) {
        userStats[e.started_by].times_started++;
      }
      if (e.witness_confirmed_by && userStats[e.witness_confirmed_by]) {
        userStats[e.witness_confirmed_by].times_witnessed++;
      }
    });

    logs.forEach((l: any) => {
      if (l.type === "bonus_token" && l.actor_id && userStats[l.actor_id]) {
        userStats[l.actor_id].bonus_tokens++;
      }
    });

    // Identify the app creator/admin (Eskil) for explicit bias check
    const adminCheck = Object.entries(userStats).map(([id, stats]) => ({
      user_id: id,
      ...stats,
      is_potential_admin: stats.name.toLowerCase().includes("eskil"),
    }));

    // Calculate expected vs actual selection rates
    const totalSelections = events.filter((e: any) => e.selected_user_id).length;
    const activeUserCount = Object.keys(userStats).length;
    const expectedRate = activeUserCount > 0 ? totalSelections / activeUserCount : 0;

    // Recent pattern analysis (last 20 rounds)
    const recentEvents = events.slice(0, 20);
    const recentSelections: Record<string, number> = {};
    recentEvents.forEach((e: any) => {
      if (e.selected_user_id) {
        recentSelections[e.selected_user_id] = (recentSelections[e.selected_user_id] || 0) + 1;
      }
    });

    // Check for consecutive avoidance patterns
    const selectionSequence = events
      .filter((e: any) => e.selected_user_id)
      .map((e: any) => ({
        user: profileMap[e.selected_user_id] || e.selected_user_id,
        date: e.created_at,
        started_by: profileMap[e.started_by] || e.started_by,
      }));

    const lastEvent = events[0];
    const lastUpdate = lastEvent ? lastEvent.created_at : "Ingen runder ennå";

    const dataForAi = {
      total_rounds: events.length,
      active_users: activeUserCount,
      last_round_date: lastUpdate,
      expected_selections_per_user: Math.round(expectedRate * 100) / 100,
      per_user_stats: adminCheck,
      token_balances: tokens.map((t: any) => ({
        user: profileMap[t.user_id] || t.user_id,
        balance: t.balance,
        last_refill: t.last_refill_at,
      })),
      recent_20_selections: Object.entries(recentSelections).map(([uid, count]) => ({
        user: profileMap[uid] || uid,
        recent_count: count,
      })),
      selection_sequence_last_15: selectionSequence.slice(0, 15),
      leaderboard,
      game_rules: {
        selection_algorithm: "Weighted random: weight = 1 / (1 + selections_last_7_days). Lower recent selections = higher chance. NO admin overrides possible.",
        deadline: "40 minutes to take the shot",
        punishment: "2 penalty shots if deadline missed",
        tokens: "Start with 5, +1 per day (max 5). 1 token per round. Bonus +1 if leading by 2+ shots.",
        cooldown: "None - new round can start immediately after previous ends",
        witness_system: "Selected user must choose a specific witness to confirm",
        code_location: "All logic runs in PostgreSQL SECURITY DEFINER functions - no client-side manipulation possible",
      },
      bias_check_targets: {
        primary: "Eskil (app creator/admin) - MUST verify this user receives NO special treatment",
        checks: [
          "Is Eskil's selection rate statistically consistent with other users?",
          "Does Eskil avoid being selected when Eskil starts rounds?",
          "Are Eskil's token balances consistent with game rules?",
          "Is there any code path that could exclude or favor Eskil?",
          "Does the weighted algorithm treat Eskil identically to all other users?",
          "Has Eskil been punished when overdue, same as others?",
          "Are there suspicious patterns in who starts rounds vs who gets selected?",
        ],
      },
    };

    const prompt = `Du er en uavhengig, kritisk og grundig rettferdighets-revisor for et "Shoot your shot"-spill.
Din VIKTIGSTE oppgave er å verifisere at spillets skaper (Eskil) IKKE får noen fordeler, unntak eller spesialbehandling.

SPILLDATA OG REGLER:
${JSON.stringify(dataForAi, null, 2)}

UTFØR FØLGENDE GRUNDIGE ANALYSE (på norsk):

## 1. ESKIL-SJEKK (KRITISK)
- Sammenlign Eskils utvalgsrate med forventet rate og andre brukere
- Sjekk om Eskil unngår å bli valgt når han starter runder
- Verifiser at Eskils token-balanse følger reglene
- Undersøk om Eskil har fått straff når det er fortjent
- Se etter korrelasjon mellom hvem som starter og hvem som velges

## 2. ALGORITMEVURDERING
- Er vektingsformelen (1/(1+siste_7_dager)) genuint rettferdig?
- Kan noen bruker manipulere sin egen vekt?
- Er det mulig å omgå algoritmen via klientkode? (Nei - SECURITY DEFINER)

## 3. STATISTISK ANALYSE
- Beregn chi-kvadrat eller avviksanalyse for seleksjonsfordelingen
- Er fordelingen innenfor normale tilfeldige variasjoner?
- Finn eventuelle outliers eller mistenkelige mønstre

## 4. TOKEN-REVISJON
- Er alle balanser konsistente med spillreglene?
- Har noen fått uforklarte bonuser?

## 5. TIDSLINJE-SJEKK
- Se på rekkefølgen av de siste 15 rundene
- Er det mistenkelige mønstre i hvem som starter vs hvem som velges?

## 6. SAMLET DOM
Gi en klar dom: ✅ RETTFERDIG / ⚠️ MULIG SKJEVHET / ❌ URETTFERDIGHET
Inkluder konkret tallgrunnlag for konklusjonen.

Vær EKSTREMT grundig og kritisk. Ikke godta noe uten bevis. Maks 500 ord.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Du er en uavhengig, kritisk revisor som sjekker rettferdighet i spill. Du er spesielt oppmerksom på om spillets skaper (Eskil) får urettferdige fordeler. Svar kun på norsk. Vær grundig og analytisk." },
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
      active_users: activeUserCount,
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
