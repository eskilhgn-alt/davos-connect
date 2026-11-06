import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_profile",
  title: "Hent min profil",
  description: "Hent den innloggede brukerens GüttaHütte-profil (navn, kallenavn, avatar).",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,nickname,avatar_url")
      .eq("id", ctx.getUserId())
      .maybeSingle();
    if (error) return errorResult(error.message);
    const profile = {
      id: data?.id ?? null,
      full_name: data?.full_name ?? null,
      nickname: data?.nickname ?? null,
      avatar_url: data?.avatar_url ?? null,
    };
    return { content: [{ type: "text", text: JSON.stringify(profile) }], structuredContent: { profile } };
  },
});
