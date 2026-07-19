import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_points_leaderboard",
  title: "Poeng-toppliste",
  description: "Hent poeng-topplisten for GüttaHütte.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("rpc_get_points_leaderboard");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { leaderboard: data },
    };
  },
});
