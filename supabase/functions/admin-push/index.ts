import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = (Deno.env.get("APP_URL") || "https://guttahutte.lovable.app").replace(/\/$/, "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[character] || character));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration missing" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const heading = typeof body.heading === "string" ? body.heading.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestId = typeof body.request_id === "string" ? body.request_id : "";
    const sendEmail = body.send_email === true;
    const suppliedIds = Array.isArray(body.include_user_ids)
      ? Array.from(new Set(body.include_user_ids.filter((id: unknown): id is string => typeof id === "string" && UUID_RE.test(id))))
      : [];

    if (!heading || heading.length > 80 || !message || message.length > 500) {
      return json({ error: "Overskrift eller melding har ugyldig lengde" }, 400);
    }
    if (!UUID_RE.test(requestId) || suppliedIds.length > 100) {
      return json({ error: "Invalid request" }, 400);
    }

    let profilesQuery = admin
      .from("profiles")
      .select("id, email")
      .eq("is_active", true)
      .eq("is_banned", false);
    if (suppliedIds.length > 0) profilesQuery = profilesQuery.in("id", suppliedIds);
    const { data: profiles, error: profileError } = await profilesQuery;
    if (profileError) throw profileError;

    const targetIds = Array.from(new Set((profiles || []).map((profile) => profile.id)));
    if (targetIds.length === 0) return json({ success: true, recipients: 0, push_sent: 0, email_sent: 0 });

    const kind = suppliedIds.length > 0 ? "direct" : "broadcast";
    const dedupeKey = `admin:${user.id}:${requestId}`;
    const { error: claimError } = await admin.from("notification_dispatches").insert({
      dedupe_key: dedupeKey,
      kind: "admin",
      source_id: user.id,
      event_type: kind,
    });
    if (claimError?.code === "23505") return json({ success: true, reason: "already_dispatched" });
    if (claimError) throw claimError;

    const errors: string[] = [];
    let pushSent = 0;
    let emailSent = 0;

    const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const oneSignalKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    if (oneSignalAppId && oneSignalKey) {
      const { data: tokens } = await admin
        .from("push_tokens")
        .select("user_id")
        .in("user_id", targetIds)
        .not("player_id", "is", null);
      const pushIds = Array.from(new Set((tokens || []).map((token) => token.user_id)));
      if (pushIds.length > 0) {
        const pushResponse = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: { Authorization: `Key ${oneSignalKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: oneSignalAppId,
            include_aliases: { external_id: pushIds },
            target_channel: "push",
            headings: { en: heading, no: heading },
            contents: { en: message, no: message },
            url: `${APP_URL}/hjem`,
            data: { kind: "admin_notification", request_id: requestId },
            ios_badgeType: "Increase",
            ios_badgeCount: 1,
          }),
        });
        if (pushResponse.ok) pushSent = pushIds.length;
        else {
          errors.push(`push:${pushResponse.status}`);
          console.error("admin-push OneSignal", pushResponse.status, await pushResponse.text());
        }
      }
    } else {
      errors.push("push:not_configured");
    }

    if (sendEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const emailFrom = Deno.env.get("EMAIL_FROM");
      if (!resendKey || !emailFrom) {
        errors.push("email:not_configured");
      } else {
        const emailResults = await Promise.all((profiles || []).map(async (profile) => {
          if (!profile.email) return false;
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: emailFrom,
              to: [profile.email],
              subject: heading,
              text: message,
              html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 20px"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p style="font-size:16px;line-height:1.55">${escapeHtml(message).replace(/\n/g, "<br>")}</p><p><a href="${APP_URL}/hjem">Åpne GüttaHütte</a></p></div>`,
            }),
          });
          if (!response.ok) console.error("admin-push Resend", response.status, await response.text());
          return response.ok;
        }));
        emailSent = emailResults.filter(Boolean).length;
        if (emailSent < emailResults.length) errors.push(`email:${emailResults.length - emailSent}_failed`);
      }
    }

    if (pushSent === 0 && (!sendEmail || emailSent === 0)) {
      await admin.from("notification_dispatches").delete().eq("dedupe_key", dedupeKey);
      return json({ error: "Ingen varsler kunne sendes", details: errors }, 502);
    }

    await admin
      .from("notification_dispatches")
      .update({ sent_at: new Date().toISOString(), last_error: errors.length ? errors.join(",") : null })
      .eq("dedupe_key", dedupeKey);
    await admin.from("admin_audit_log").insert({
      admin_id: user.id,
      action: `admin_notification_${kind}`,
      details: { request_id: requestId, recipients: targetIds.length, push_sent: pushSent, email_sent: emailSent, errors },
    });

    return json({ success: true, recipients: targetIds.length, push_sent: pushSent, email_sent: emailSent, warnings: errors });
  } catch (error) {
    console.error("admin-push failed", error);
    return json({ error: "Kunne ikke sende varsler" }, 500);
  }
});
