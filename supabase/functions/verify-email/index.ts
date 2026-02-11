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
    const { token } = await req.json();

    if (!token || typeof token !== "string" || token.length < 10) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find profile with this token
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email_verified, email_verification_token, email_verification_expires_at")
      .eq("email_verification_token", token)
      .maybeSingle();

    if (error || !profile) {
      return new Response(JSON.stringify({ error: "Ugyldig eller utløpt bekreftelseslenke" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.email_verified) {
      return new Response(JSON.stringify({ verified: true, already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (profile.email_verification_expires_at && new Date(profile.email_verification_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Bekreftelseslenken har utløpt. Logg inn og send en ny." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as verified
    await supabaseAdmin
      .from("profiles")
      .update({
        email_verified: true,
        email_verification_token: null,
        email_verification_expires_at: null,
      })
      .eq("id", profile.id);

    return new Response(JSON.stringify({ verified: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify-email error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
