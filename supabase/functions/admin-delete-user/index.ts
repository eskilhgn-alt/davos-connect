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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify caller is authenticated
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminId = claimsData.claims.sub;

    // Verify caller is admin
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: adminId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: not admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing target_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (target_user_id === adminId) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up non-FK-linked data before auth deletion
    // These tables reference user_id but may not have CASCADE FKs
    const cleanupTables = [
      { table: "user_locations", col: "user_id" },
      { table: "user_streaks", col: "user_id" },
      { table: "user_points", col: "user_id" },
      { table: "points_ledger", col: "user_id" },
      { table: "token_ledger", col: "user_id" },
      { table: "ski_altitude_samples", col: "user_id" },
      { table: "ski_daily_vertical", col: "user_id" },
      { table: "ski_daily_awards", col: "user_id" },
      { table: "ski_speed_records", col: "user_id" },
      { table: "ski_track_points", col: "user_id" },
      { table: "chat_reads", col: "user_id" },
      { table: "poll_votes", col: "user_id" },
      { table: "story_views", col: "user_id" },
      { table: "bug_reports", col: "user_id" },
      { table: "checklist_items", col: "created_by" },
      { table: "admin_notes", col: "target_user_id" },
    ];

    for (const { table, col } of cleanupTables) {
      await supabaseAdmin.from(table).delete().eq(col, target_user_id);
    }

    // Also clean up audit log references (target only, keep admin actions)
    await supabaseAdmin.from("admin_audit_log").delete().eq("target_user_id", target_user_id);

    // Log the action before deletion
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: adminId,
      action: "user_deleted",
      target_user_id,
      details: { reason: "admin_kick" },
    });

    // Delete from auth.users (cascades to profiles, user_roles, shot_tokens, etc. via FK CASCADE)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);
    if (deleteError) {
      console.error("Delete user error:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete user", details: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ deleted: true, user_id: target_user_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
