import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { place_id } = await req.json();
    if (!place_id) {
      return new Response(JSON.stringify({ error: "place_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if we already have cached signals
    const { data: existing } = await serviceClient
      .from("place_signals")
      .select("*")
      .eq("place_id", place_id)
      .maybeSingle();

    if (existing?.ai_summary) {
      return new Response(JSON.stringify({ signals: existing, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get place data
    const { data: place } = await serviceClient
      .from("places")
      .select("*")
      .eq("id", place_id)
      .single();

    if (!place) {
      return new Response(JSON.stringify({ error: "Place not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO Sprint 3: Call OpenAI to generate summary + scores
    // For now, return a placeholder
    const placeholder = {
      place_id,
      ai_summary: `${place.name} – AI-oppsummering kommer i Sprint 3.`,
      why_this: "Basert på rating og avstand.",
      touristy_score: null,
      local_vibe_score: null,
      group_friendly_score: null,
      quality_score: null,
      value_score: null,
    };

    // Upsert placeholder
    await serviceClient
      .from("place_signals")
      .upsert(placeholder, { onConflict: "place_id" });

    return new Response(JSON.stringify({ signals: placeholder, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("food-ai-summarize-place error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
