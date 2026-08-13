/**
 * Kildekode-/migrasjonssikkerhet for ny Shot-trekning.
 * Leser den pending SQL-filen og Edge Function-kilden og kontrollerer at
 * kontrakten holdes — uten å kjøre noe mot produksjon.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const sqlRaw = readFileSync("supabase/migrations-pending/20260810_shot_draws.sql", "utf8");
// Skann kun kjørbar SQL – kommentarer nevner legacy-navn bevisst.
const sql = sqlRaw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const edge = readFileSync("supabase/functions/shot-draw/index.ts", "utf8");
const edgeCore = readFileSync("supabase/functions/shot-draw/core.ts", "utf8");

describe("pending migrasjon – sikkerhet", () => {
  it("inneholder ingen DROP/DELETE/TRUNCATE av data", () => {
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(sql).not.toMatch(/\bDROP\s+POLICY\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("gjenbruker ikke legacy gamification-objekter (kun ikke-destruktiv lås)", () => {
    // Legacy-navn får kun forekomme i REVOKE/GRANT-låsen, aldri som datakilde.
    for (const legacy of ["shot_events", "shot_event_log", "shot_tokens"]) {
      const uses = sql.split("\n").filter((l) => l.includes(legacy));
      expect(uses.every((l) => /ARRAY\[|REVOKE|GRANT/.test(l))).toBe(true);
    }
    for (const legacy of [
      "token_ledger",
      "points_ledger",
      "user_points",
      "user_streaks",
      "ski_daily",
    ]) {
      expect(sql).not.toContain(legacy);
    }
  });

  it("har RLS på alle nye tabeller", () => {
    for (const t of ["shot_draws", "shot_draw_participants", "shot_draw_secrets"]) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("gir authenticated kun SELECT, og ingen tilgang til seed", () => {
    expect(sql).toContain("GRANT SELECT ON public.shot_draws TO authenticated");
    expect(sql).toContain("GRANT SELECT ON public.shot_draw_participants TO authenticated");
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*TO authenticated/i);
    expect(sql).not.toMatch(/GRANT[^;]*shot_draw_secrets\s+TO\s+authenticated/i);
    expect(sql).toContain("GRANT ALL ON public.shot_draw_secrets TO service_role");
  });

  it("revoker fra PUBLIC og anon", () => {
    expect(sql).toContain("REVOKE ALL ON public.shot_draws FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_shot_start\(uuid, text\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_shot_finalize\(uuid\) FROM PUBLIC, anon/);
  });

  it("alle funksjoner har fast search_path", () => {
    const fns = sql.match(/CREATE OR REPLACE FUNCTION public\.[a-z_]+/g) ?? [];
    expect(fns.length).toBeGreaterThanOrEqual(6);
    const setPaths = sql.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(setPaths.length).toBe(fns.length);
  });

  it("håndhever medlemskap og trip_id server-side i RPC-ene", () => {
    const guards = sql.match(/is_approved_trip_member/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(6);
    expect(sql).toContain("is_trip_active(p_trip_id)");
    expect(sql).toContain("trip_archived");
  });

  it("bruker auth.uid() og ikke klientoppgitt bruker-id", () => {
    expect(sql).toContain("v_uid uuid := auth.uid()");
    expect(sql).not.toMatch(/p_user_id/);
  });

  it("har partial unique index for én aktiv trekning per tur", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS shot_draws_one_active_per_trip[\s\S]*WHERE status = 'countdown'/,
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
  });

  it("har idempotensnøkkel og rate limit", () => {
    expect(sql).toContain("UNIQUE (trip_id, idempotency_key)");
    expect(sql).toContain("rate_limited");
  });

  it("har unike deltakere og posisjoner", () => {
    expect(sql).toContain("UNIQUE (draw_id, user_id)");
    expect(sql).toContain("UNIQUE (draw_id, position)");
  });

  it("legger nye tabeller idempotent i realtime-publication", () => {
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_draws");
    expect(sql).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_draw_participants",
    );
  });

  it("bruker rejection sampling, ikke naken modulo", () => {
    expect(sql).toContain("shot_draw_pick_position");
    expect(sql).toContain("(4294967296::bigint / p_n) * p_n");
    expect(sql).toContain("gen_random_bytes(32)");
  });

  it("har service-role bakgrunnsfinalisering uten klientkontekst", () => {
    expect(sql).toContain("rpc_shot_finalize_service");
    expect(sql).toContain("rpc_shot_due_draws_all");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_shot_finalize_service\(uuid\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_shot_due_draws_all\(\) FROM PUBLIC, anon, authenticated/);
  });

  it("avslører seed først ved finalisering", () => {
    expect(sql).toMatch(/SET status = 'finalized'[\s\S]*seed_reveal = v_seed/);
  });

  it("har ingen adminoverstyring, reroll eller vekting", () => {
    expect(sql).not.toMatch(/is_admin/);
    expect(sql).not.toMatch(/reroll|weight|anti_repeat|exclude/i);
  });
});

describe("edge function shot-draw", () => {
  it("krever JWT og verifiserer caller", () => {
    expect(edge).toContain("Bearer ");
    expect(edge).toContain("auth.getUser()");
  });

  it("bruker dedupe keys for start og resultat", () => {
    expect(edgeCore).toContain("shot:${state.draw.id}:start");
    expect(edgeCore).toContain("shot:${draw.id}:result");
  });

  it("sletter aldri dispatch-rader ved feil (ikke-destruktiv retry)", () => {
    expect(edge).not.toMatch(/notification_dispatches"\)\s*\.delete\(/);
    expect(edge).not.toMatch(/\.delete\(\)/);
    expect(edge).toContain("markDispatchFailed");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS attempts");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lease_token uuid");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS provider_idempotency_key uuid");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS recipient_count integer");
  });

  it("har atomisk claim/mark_sent/mark_failed som service-only RPC-er", () => {
    expect(sql).toMatch(/INSERT INTO public\.notification_dispatches[\s\S]*ON CONFLICT \(dedupe_key\) DO UPDATE/);
    expect(sql).toContain("WHERE nd.sent_at IS NULL");
    expect(sql).toContain("nd.lease_expires_at <= now()");
    expect(sql).toContain("'already_sent'");
    expect(sql).toContain("'busy'");
    for (const fn of [
      "rpc_notification_dispatch_claim",
      "rpc_notification_dispatch_mark_sent",
      "rpc_notification_dispatch_mark_failed",
    ]) {
      expect(sql).toContain(fn);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*FROM PUBLIC, anon, authenticated`));
    }
    // Port 0: lease-token må være eksplisitt ikke-null, ikke bare «ikke ulik».
    expect(sql).not.toContain("lease_token IS NOT DISTINCT FROM p_lease_token");
    expect(sql).toContain("AND p_lease_token IS NOT NULL");
    expect(sql).toContain("AND lease_token = p_lease_token");
  });

  it("låser legacy shot-flater uten å slette historikk", () => {
    expect(sql).toContain("REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated");
    expect(sql).toMatch(/ARRAY\['shot_events', 'shot_event_log', 'shot_tokens'\]/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
  });

  it("har bakgrunnsvei (sweep) med service-role og delt hemmelighet", () => {
    expect(edgeCore).toContain('action === "sweep"');
    expect(edgeCore).toContain("rpc_shot_due_draws_all");
    expect(edgeCore).toContain("rpc_shot_finalize_service");
    expect(edge).toContain("SHOT_SWEEP_SECRET");
  });

  it("pushmottakere hentes fra trekningens frosne snapshot", () => {
    expect(edgeCore).toContain("snapshotRecipients(args.drawId)");
    expect(edge).toContain('.from("shot_draw_participants")');
    expect(edge).toContain('.eq("draw_id", drawId)');
    // Ingen medlemsoppslag på sendetidspunktet.
    expect(edge).not.toContain('.from("trip_members")');
  });

  it("utleder leverbare mottakere server-side", () => {
    expect(edge).toContain("push_tokens");
    expect(edge).toContain("EdgeRuntime");
  });

  it("bruker stabil provider-idempotency-key mot pushprovider", () => {
    expect(edge).toContain("Idempotency-Key");
    expect(edge).toContain("providerIdempotencyKey");
    expect(edgeCore).toContain("providerIdempotencyKey: providerKey");
  });

  it("holder OneSignal-hemmeligheter i Edge-env", () => {
    expect(edge).toContain('Deno.env.get("ONESIGNAL_REST_API_KEY")');
  });
});

describe("klienten er fri for legacy gamification og lokal random", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  const files = walk("src");

  it("har ingen klientflater for tokens/poeng/streaks/frikort/ski-gamification", () => {
    const banned = /\b(shot_tokens|shot_events|token_ledger|points_ledger|user_points|user_streaks|user_frikort|ski_daily_vertical|rpc_award_points|rpc_get_shot_tokens|rpc_get_points_leaderboard|rpc_start_shot_round)\b/;
    const offenders = files.filter(
      (f) =>
        !f.includes("integrations/supabase/types.ts") &&
        !/[\\/]test[\\/]|__tests__|\.test\./.test(f) &&
        banned.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("MCP-manifestet eksponerer ingen shot-verktøy", () => {
    const manifestPath = ".lovable/mcp/manifest.json";
    if (!existsSync(manifestPath)) return;
    expect(readFileSync(manifestPath, "utf8")).not.toMatch(/shot|token|points|leaderboard/i);
  });

  it("Shot-klienten trekker aldri selv", () => {
    const shotFiles = files.filter((f) => /shot/i.test(f) && !/\.test\./.test(f));
    expect(shotFiles.length).toBeGreaterThan(0);
    for (const f of shotFiles) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/Math\.random\s*\(/);
    }
  });
});
