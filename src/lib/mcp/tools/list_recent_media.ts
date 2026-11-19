import { defineTool } from "@lovable.dev/mcp-js";
import { activeTripForUser, errorResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_media",
  title: "Stories og Minner siste døgn",
  description: "Oversikt (uten filer) over aktive Stories og nye Minner i den aktive turen siste 24 timer.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const supabase = supabaseForUser(ctx);
    const t = await activeTripForUser(supabase, ctx.getUserId()!);
    if ("reason" in t) return errorResult(t.reason);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const [stories, minner, profiles] = await Promise.all([
      supabase.from("stories").select("id,user_id,type,created_at").eq("trip_id", t.trip.id).gt("expires_at", now.toISOString()).order("created_at", { ascending: false }).limit(100),
      supabase.from("gallery_items").select("id,uploaded_by,type,caption,created_at").eq("trip_id", t.trip.id).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id,nickname,full_name"),
    ]);
    if (stories.error) return errorResult(stories.error.message);
    if (minner.error) return errorResult(minner.error.message);
    const name = new Map((profiles.data ?? []).map((p) => [p.id, p.nickname || p.full_name || "Ukjent"]));
    const result = {
      stories: (stories.data ?? []).map((s) => ({ id: s.id, by: name.get(s.user_id) ?? "Ukjent", type: s.type, created_at: s.created_at })),
      minner: (minner.data ?? []).map((g) => ({ id: g.id, by: name.get(g.uploaded_by) ?? "Ukjent", type: g.type, caption: g.caption, created_at: g.created_at })),
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
