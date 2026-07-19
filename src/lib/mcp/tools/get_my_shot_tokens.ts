import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_shot_tokens",
  title: "Hent mine shot tokens",
  description: "Hent den innloggede brukerens shot-token-saldo og frikort.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [{ data: tokens }, { data: frikort }] = await Promise.all([
      supabase.from("shot_tokens").select("*").eq("user_id", ctx.getUserId()).maybeSingle(),
      supabase.from("user_frikort").select("*").eq("user_id", ctx.getUserId()).maybeSingle(),
    ]);
    const result = { tokens: tokens ?? null, frikort: frikort ?? null };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
