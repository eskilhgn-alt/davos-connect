import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Metoden er ikke tillatt" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const token = body?.token;

    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return json({ error: "Ugyldig bekreftelseslenke" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase environment variables");
      return json({ error: "E-postbekreftelse er midlertidig utilgjengelig" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tokenHash = await sha256(token.toLowerCase());
    const { data, error } = await admin.rpc("consume_email_verification_token", {
      p_token_hash: tokenHash,
    });

    if (error) {
      console.error("Could not consume verification token", error);
      return json({ error: "Kunne ikke bekrefte e-postadressen" }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (result?.status === "verified") {
      return json({ verified: true });
    }

    if (result?.status === "expired") {
      return json(
        { error: "Bekreftelseslenken er utløpt. Be om en ny lenke i innstillingene." },
        400,
      );
    }

    return json({ error: "Bekreftelseslenken er ugyldig eller allerede brukt" }, 400);
  } catch (error) {
    console.error("verify-email failed", error);
    return json({ error: "Kunne ikke bekrefte e-postadressen" }, 500);
  }
});
