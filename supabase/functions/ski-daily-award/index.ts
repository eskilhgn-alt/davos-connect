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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Award vertical meters winner
    const { data: verticalResult, error: verticalError } = await supabase.rpc("rpc_award_ski_daily_winner");
    if (verticalError) console.error("Vertical award error:", verticalError);
    else console.log("Vertical winner result:", verticalResult);

    // Award speed winner
    const { data: speedResult, error: speedError } = await supabase.rpc("rpc_award_ski_speed_winner");
    if (speedError) console.error("Speed award error:", speedError);
    else console.log("Speed winner result:", speedResult);

    return new Response(JSON.stringify({ vertical: verticalResult, speed: speedResult }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
