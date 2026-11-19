import { defineTool } from "@lovable.dev/mcp-js";
import { activeTripForUser, errorResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_active_trip",
  title: "Aktiv tur",
  description: "Hent den aktive turen: navn, destinasjon, land, tidssone, valuta og datoer (null hvis ikke satt).",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Ikke innlogget");
    const t = await activeTripForUser(supabaseForUser(ctx), ctx.getUserId()!);
    if ("reason" in t) return errorResult(t.reason);
    const trip = { ...t.trip };
    return { content: [{ type: "text", text: JSON.stringify(trip) }], structuredContent: { trip } };
  },
});
