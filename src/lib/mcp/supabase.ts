import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!url) throw new Error("SUPABASE_URL mangler");
  return url;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys.default, ...Object.values(keys)]
          .find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"))
          ?.trim();
        if (key) return key;
      }
    } catch {
      // ignore malformed keyset
    }
  }
  const legacy = configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  if (legacy) return legacy;
  throw new Error("Publishable key mangler");
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Krever verifisert OAuth-token");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type UserClient = ReturnType<typeof supabaseForUser>;

export const errorResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true,
});

/**
 * Finn den aktive turen brukeren er medlem av. RLS avgjør synlighet;
 * vi krever i tillegg medlemsrad og at profilen ikke er utestengt.
 */
export async function activeTripForUser(
  supabase: UserClient,
  userId: string,
): Promise<
  | { ok: true; trip: { id: string; name: string; destination: string; country: string | null; timezone: string; currency: string; start_date: string | null; end_date: string | null; status: string } }
  | { ok: false; reason: string }
> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_banned) return { ok: false, reason: "Ingen tilgang." };
  const { data: trip, error } = await supabase
    .from("trips")
    .select("id,name,destination,country,timezone,currency,start_date,end_date,status")
    .eq("status", "active")
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!trip) return { ok: false, reason: "Ingen aktiv tur." };
  const { data: member } = await supabase
    .from("trip_members")
    .select("user_id")
    .eq("trip_id", trip.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ok: false, reason: "Du er ikke medlem av den aktive turen." };
  return { ok: true, trip };
}
