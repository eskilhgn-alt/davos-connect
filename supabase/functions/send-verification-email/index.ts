import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  for (const byte of arr) token += chars[byte % chars.length];
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Use getUser to validate the JWT (getClaims doesn't exist in supabase-js v2)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    if (!userEmail) {
      return new Response(JSON.stringify({ error: "No email on account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already verified
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email_verified")
      .eq("id", userId)
      .single();

    if (profile?.email_verified) {
      return new Response(JSON.stringify({ already_verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate token and expiry (1 hour)
    const verificationToken = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Save token to profile
    await supabaseAdmin
      .from("profiles")
      .update({
        email_verification_token: verificationToken,
        email_verification_expires_at: expiresAt,
      })
      .eq("id", userId);

    // Determine app URL
    let bodyData: any = {};
    try { bodyData = await req.json(); } catch { /* empty body is ok */ }
    const appUrl = bodyData?.app_url || "https://guttahutte.lovable.app";
    const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Resend not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GüttaHütte <onboarding@resend.dev>",
        to: [userEmail],
        subject: "Bekreft e-posten din – GüttaHütte",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
            <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">GüttaHütte 🏔️</h1>
            <p style="color: #666; margin-bottom: 24px;">Velkommen! Bekreft e-posten din for å komme i gang.</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Bekreft e-post
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 32px;">
              Lenken er gyldig i 1 time. Hvis du ikke registrerte deg, kan du ignorere denne e-posten.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend error:", errBody);
      return new Response(JSON.stringify({ error: "Failed to send email", details: errBody }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-verification-email error:", err);
    return new Response(JSON.stringify({ error: "Internal error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
