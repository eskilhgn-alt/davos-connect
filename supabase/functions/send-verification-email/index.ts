import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const appUrl = (Deno.env.get("APP_URL") || "https://guttahutte.lovable.app").replace(/\/$/, "");
  const emailFrom = Deno.env.get("EMAIL_FROM") || "GüttaHütte <onboarding@resend.dev>";
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Server configuration missing" }, 500);
  if (!resendKey) return json({ error: "E-posttjenesten er ikke konfigurert" }, 503);

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user?.id || !user.email) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email_verified")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) return json({ error: "Profilen finnes ikke" }, 404);
    if (profile.email_verified) return json({ already_verified: true });

    const { data: existing } = await admin
      .from("email_verification_tokens")
      .select("last_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.last_sent_at) {
      const elapsedMs = Date.now() - new Date(existing.last_sent_at).getTime();
      if (elapsedMs < 60_000) {
        return json({ error: "Vent litt før du sender på nytt", retry_after: Math.ceil((60_000 - elapsedMs) / 1000) }, 429);
      }
    }

    const token = generateToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sentAt = new Date().toISOString();
    const { error: tokenError } = await admin.from("email_verification_tokens").upsert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_sent_at: sentAt,
      created_at: sentAt,
    }, { onConflict: "user_id" });
    if (tokenError) throw tokenError;

    const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailFrom,
        to: [user.email],
        subject: "Bekreft e-posten din – GüttaHütte",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">
            <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">GüttaHütte 🏔️</h1>
            <p style="color:#666;margin-bottom:24px">Bekreft e-posten din for å bli med i turgruppen.</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#103A5D;color:#fff;padding:12px 32px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px">Bekreft e-post</a>
            <p style="color:#777;font-size:13px;margin-top:32px">Lenken er gyldig i én time. Hvis du ikke registrerte deg, kan du ignorere denne e-posten.</p>
          </div>`,
      }),
    });

    if (!emailRes.ok) {
      console.error("Resend error", emailRes.status, await emailRes.text());
      await admin.from("email_verification_tokens").delete().eq("user_id", user.id).eq("token_hash", tokenHash);
      return json({ error: "Kunne ikke sende e-post. Prøv igjen." }, 502);
    }

    // Never persist the plaintext token in the group-readable profiles table.
    await admin.from("profiles").update({
      email_verification_token: null,
      email_verification_expires_at: null,
    }).eq("id", user.id);

    return json({ sent: true });
  } catch (error) {
    console.error("send-verification-email", error);
    return json({ error: "Intern feil" }, 500);
  }
});
