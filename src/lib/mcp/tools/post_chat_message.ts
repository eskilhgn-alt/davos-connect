import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { activeTripForUser, errorResult, supabaseForUser } from "../supabase";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

export default defineTool({
  name: "post_chat_message",
  title: "Send chat-melding",
  description: "Send en melding til chatten for den aktive turen, som den innloggede brukeren.",
  inputSchema: {
    text: z.string().trim().min(1).max(2000).describe("Meldingsteksten."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ text }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const t = await activeTripForUser(supabase, userId);
    if ("reason" in t) return errorResult(t.reason);
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname,full_name")
      .eq("id", userId)
      .maybeSingle();
    const senderName = profile?.nickname || profile?.full_name || "Ukjent";
    const { data, error } = await supabase
      .from("messages")
      .insert({ text, thread_id: DEFAULT_THREAD_ID, trip_id: t.trip.id, sender_id: userId, sender_name: senderName })
      .select("id,created_at")
      .single();
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: `Sendt til ${t.trip.name}: "${text}"` }],
      structuredContent: { message: { id: data.id, created_at: data.created_at } },
    };
  },
});
