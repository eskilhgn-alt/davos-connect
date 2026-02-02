/**
 * Weather Engine Get - Public endpoint to serve cached weather data
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const url = new URL(req.url);
    const mountainId = url.searchParams.get("mountain_id") || "all";

    if (mountainId === "all") {
      // Return all mountains
      const { data, error } = await supabase
        .from("weather_cache")
        .select("mountain_id, generated_at, payload")
        .order("mountain_id");

      if (error) {
        throw error;
      }

      const now = Date.now();
      const results = (data || []).map(row => {
        const generatedAt = new Date(row.generated_at).getTime();
        const stale = now - generatedAt > STALE_THRESHOLD_MS;
        return {
          mountainId: row.mountain_id,
          stale,
          generatedAt: row.generated_at,
          ...row.payload,
        };
      });

      // Check if any data is stale
      const anyStale = results.some(r => r.stale);

      return new Response(
        JSON.stringify({
          mountains: results.filter(r => r.mountainId !== "davos"),
          davos: results.find(r => r.mountainId === "davos") || null,
          stale: anyStale,
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Return specific mountain
      const { data, error } = await supabase
        .from("weather_cache")
        .select("mountain_id, generated_at, payload")
        .eq("mountain_id", mountainId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Mountain not found", mountainId }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw error;
      }

      const generatedAt = new Date(data.generated_at).getTime();
      const stale = Date.now() - generatedAt > STALE_THRESHOLD_MS;

      return new Response(
        JSON.stringify({
          mountainId: data.mountain_id,
          stale,
          generatedAt: data.generated_at,
          fetchedAt: new Date().toISOString(),
          ...data.payload,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Weather engine get error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
