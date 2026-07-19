import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_profile",
  title: "Hent min profil",
  description: "Hent den innloggede brukerens GüttaHütte-profil (navn, kallenavn, avatar, admin-status).",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [{ data: profile, error }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,nickname,avatar_url,is_active,is_banned,created_at").eq("id", ctx.getUserId()).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", ctx.getUserId()),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const result = { ...profile, roles: (roles ?? []).map((r: any) => r.role) };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
