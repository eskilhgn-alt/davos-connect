import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

const WELCOME_THREAD_ID = "00000000-0000-0000-0000-000000000001";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "post_chat_message",
  title: "Send chat-melding",
  description: "Send en melding til GüttaHütte-hovedchatten som den innloggede brukeren.",
  inputSchema: {
    text: z.string().trim().min(1).max(2000).describe("Meldingsteksten som skal sendes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ text }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname,full_name")
      .eq("id", userId)
      .maybeSingle();
    const senderName = profile?.nickname || profile?.full_name || "Ukjent";
    const { data, error } = await supabase
      .from("messages")
      .insert({ text, thread_id: WELCOME_THREAD_ID, sender_id: userId, sender_name: senderName })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Sendt: "${text}"` }],
      structuredContent: { message: data },
    };
  },
});
