import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Check admin
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isAdmin } = await adminClient.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, message } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const appUrl = "https://davos-joy-connect.lovable.app";
    const personalMessage = message
      ? `<p style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:8px;color:#333;font-style:italic;">"${message}"</p>`
      : "";

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Glühwein <onboarding@resend.dev>",
      to: [email],
      subject: "Du er invitert til Glühwein! 🍷",
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="font-size:28px;margin:0;color:#103A5D;">Glühwein 🍷</h1>
            <p style="color:#666;margin-top:4px;">Privat gruppe-app for crewet</p>
          </div>
          
          <p style="font-size:16px;color:#333;">Hei!</p>
          <p style="font-size:16px;color:#333;">Du har blitt invitert til <strong>Glühwein</strong> – vår private app for ski, chat og opplevelser.</p>
          
          ${personalMessage}
          
          <div style="text-align:center;margin:32px 0;">
            <a href="${appUrl}/auth" style="display:inline-block;padding:14px 32px;background:#103A5D;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:16px;">
              Bli med i Glühwein
            </a>
          </div>
          
          <p style="font-size:14px;color:#666;">Etter registrering kan du installere appen på hjemskjermen for beste opplevelse:</p>
          <ol style="font-size:14px;color:#666;padding-left:20px;">
            <li>Åpne lenken i Safari</li>
            <li>Trykk på Del-ikonet (firkant med pil opp)</li>
            <li>Velg "Legg til på Hjem-skjerm"</li>
          </ol>
          
          <hr style="border:none;border-top:1px solid #eee;margin:32px 0;" />
          <p style="font-size:12px;color:#999;text-align:center;">Denne invitasjonen ble sendt fra Glühwein-appen.</p>
        </div>
      `,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return new Response(JSON.stringify({ error: emailError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: emailData?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
