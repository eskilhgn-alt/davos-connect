import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { activeTripForUser, errorResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_chat_messages",
  title: "Nylige chat-meldinger",
  description: "Hent de siste meldingene i chatten for den aktive turen.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Antall meldinger (1-100)."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const supabase = supabaseForUser(ctx);
    const t = await activeTripForUser(supabase, ctx.getUserId()!);
    if (!t.ok) return errorResult(t.reason);
    const { data, error } = await supabase
      .from("messages")
      .select("id,text,sender_name,created_at")
      .eq("trip_id", t.trip.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) return errorResult(error.message);
    const messages = (data ?? []).map((m) => ({ id: m.id, text: m.text, sender_name: m.sender_name, created_at: m.created_at }));
    return { content: [{ type: "text", text: JSON.stringify(messages) }], structuredContent: { messages } };
  },
});
