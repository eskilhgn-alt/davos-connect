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

    const { lat, lng, radius_m = 5000, category = "all", open_now, price_level } = await req.json();

    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: "lat and lng required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO Sprint 2: Check place_query_cache first
    // TODO Sprint 2: If cache miss, call Google Places API
    // TODO Sprint 2: Normalize & upsert into places table
    // TODO Sprint 2: Store cache entry

    // For now, return places from DB within radius (mock-seeded or previously imported)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Simple bounding box filter + haversine in JS
    const degPerM = 1 / 111320;
    const latRange = radius_m * degPerM;
    const lngRange = radius_m * degPerM / Math.cos((lat * Math.PI) / 180);

    let query = serviceClient
      .from("places")
      .select("*, place_signals(*)")
      .gte("lat", lat - latRange)
      .lte("lat", lat + latRange)
      .gte("lng", lng - lngRange)
      .lte("lng", lng + lngRange)
      .limit(50);

    if (price_level) {
      query = query.eq("price_level", price_level);
    }

    const { data: places, error } = await query;

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ places: places ?? [], source: "db" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("food-search-nearby error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
