/**
 * Shared auth helpers for edge functions.
 *
 * Rule of thumb:
 * - `requireApprovedMember` for anything that reads/writes private app data.
 *   A valid JWT alone is NOT enough — the user must be approved and not
 *   banned/inactive.
 * - `requireAdmin` for admin-only maintenance endpoints. Also implies approved.
 * - `requireCronSecret` for scheduled/webhook endpoints that must accept a
 *   pre-shared secret instead of a user JWT.
 *
 * Service-role privileges must ONLY be used AFTER one of these checks passes.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface CallerContext {
  userId: string;
  admin: SupabaseClient;
}

function serverEnv() {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) throw new AuthError(500, "server_configuration");
  return { url, anon, service };
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Verify JWT + membership_status='approved' + not banned + is_active. */
export async function requireApprovedMember(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new AuthError(401, "unauthorized");
  const { url, anon, service } = serverEnv();

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new AuthError(401, "unauthorized");
  const userId = data.user.id;

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: approved, error: apprErr } = await admin.rpc("is_approved_member", { _uid: userId });
  if (apprErr || approved !== true) throw new AuthError(403, "not_approved");

  return { userId, admin };
}

/** requireApprovedMember + is_admin. */
export async function requireAdmin(req: Request): Promise<CallerContext> {
  const ctx = await requireApprovedMember(req);
  const { data: isAdmin, error } = await ctx.admin.rpc("is_admin", { _user_id: ctx.userId });
  if (error || isAdmin !== true) throw new AuthError(403, "not_admin");
  return ctx;
}

/** Endpoints called by cron/webhooks: require pre-shared CRON_SECRET header. */
export function requireCronSecret(req: Request): void {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) throw new AuthError(500, "server_configuration");
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("X-Cron-Secret") ?? "";
  if (provided !== expected) throw new AuthError(401, "invalid_cron_secret");
}

export function authErrorResponse(err: unknown, corsHeaders: Record<string, string>): Response {
  const e = err instanceof AuthError ? err : new AuthError(500, "internal");
  return new Response(JSON.stringify({ error: e.code }), {
    status: e.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
