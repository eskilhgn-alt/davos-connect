import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { activeTripForUser, errorResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_agenda",
  title: "Agenda",
  description: "Hent agendaen (tidslinjen) for den aktive turen, sortert etter starttid.",
  inputSchema: {
    upcoming_only: z.boolean().default(false).describe("Bare hendelser som ikke er ferdige."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maks antall hendelser."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ upcoming_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const supabase = supabaseForUser(ctx);
    const t = await activeTripForUser(supabase, ctx.getUserId()!);
    if ("reason" in t) return errorResult(t.reason);
    let q = supabase
      .from("agenda_events")
      .select("id,title,description,start_at,end_at")
      .eq("trip_id", t.trip.id)
      .order("start_at", { ascending: true })
      .limit(limit ?? 50);
    if (upcoming_only) q = q.gte("end_at", new Date().toISOString());
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    const events = (data ?? []).map((e) => ({ id: e.id, title: e.title, description: e.description, start_at: e.start_at, end_at: e.end_at }));
    return {
      content: [{ type: "text", text: JSON.stringify({ timezone: t.trip.timezone, events }) }],
      structuredContent: { timezone: t.trip.timezone, events },
    };
  },
});
