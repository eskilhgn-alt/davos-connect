import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";
import { z } from "npm:zod@3";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const RUN_HEADER = "X-Lovable-AIG-Run-ID";

const Body = z.object({
  trip_id: z.string().uuid(),
  since: z.string().datetime({ offset: true }).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metode ikke tillatt" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Ikke innlogget" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ugyldig forespørsel" }, 400);
  const { trip_id, since } = parsed.data;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice(7);
  const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (authErr || !userId) return json({ error: "Ikke innlogget" }, 401);

  // Medlemskap, ban og tur sjekkes med brukerens egen klient (RLS gjelder).
  const [{ data: profile }, { data: member }, { data: trip }] = await Promise.all([
    supabase.from("profiles").select("is_banned").eq("id", userId).maybeSingle(),
    supabase.from("trip_members").select("user_id").eq("trip_id", trip_id).eq("user_id", userId).maybeSingle(),
    supabase.from("trips").select("id,name,timezone").eq("id", trip_id).maybeSingle(),
  ]);
  if (!profile || profile.is_banned || !member || !trip) return json({ error: "Ingen tilgang til denne turen" }, 403);

  const fromIso = since ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("text,sender_name,created_at")
    .eq("trip_id", trip_id)
    .is("deleted_at", null)
    .gt("created_at", fromIso)
    .order("created_at", { ascending: true })
    .limit(200);
  if (msgErr) return json({ error: "Kunne ikke hente meldinger" }, 500);
  if (!msgs || msgs.length === 0) return json({ summary: null, count: 0 });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "AI er ikke konfigurert" }, 500);

  const transcript = msgs
    .map((m) => `[${new Date(m.created_at).toLocaleString("nb-NO", { timeZone: trip.timezone })}] ${m.sender_name}: ${(m.text ?? "").slice(0, 500)}`)
    .join("\n");

  let runId = req.headers.get(RUN_HEADER)?.trim() || undefined;
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const h = new Headers(init?.headers);
      if (runId && !h.has(RUN_HEADER)) h.set(RUN_HEADER, runId);
      const r = await fetch(input, { ...init, headers: h });
      runId ??= r.headers.get(RUN_HEADER)?.trim() || undefined;
      return r;
    },
  });

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      system:
        "Du oppsummerer en privat gruppechat for en vennegjeng på tur. Skriv kort på norsk (3–6 punkter): hva som er avtalt, planer, spørsmål som venter på svar, og morsomme høydepunkter. Ikke dikt opp noe som ikke står i meldingene. Ikke ta med sensitive personopplysninger.",
      messages: [{ role: "user", content: `Meldinger i ${trip.name}:\n${transcript}` }],
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const text = (await result.text).trim();
    if (!text) return json({ error: "AI ga ikke noe svar" }, 502);
    return json({ summary: text, count: msgs.length });
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode ?? 500;
    console.error("chat-summary feilet", status, (e as Error)?.message);
    const msg =
      status === 402 ? "AI-kvoten er brukt opp for denne måneden."
      : status === 429 ? "For mange forespørsler akkurat nå. Prøv igjen om litt."
      : status === 403 ? "AI er ikke tilgjengelig for denne appen nå."
      : "Kunne ikke lage sammendrag.";
    return json({ error: msg }, status >= 400 && status < 600 ? status : 500);
  }
});
