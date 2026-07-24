
-- =============================================================================
-- Security phase 2: legacy revoke, sensitive column lockdown, attachments fix
-- =============================================================================

-- 1. Repair stringified messages.attachments (was JSON-encoded twice).
UPDATE public.messages
   SET attachments = (attachments #>> '{}')::jsonb
 WHERE attachments IS NOT NULL
   AND jsonb_typeof(attachments) = 'string';

-- 2. Revoke EXECUTE from public/anon/authenticated on avviklede spill-RPC-er.
--    Admin-only RPCs already deny non-admin internally, but we also strip
--    execute from public callers to shrink the attack surface.
DO $$
DECLARE
  fn text;
  legacy_fns text[] := ARRAY[
    'rpc_apply_overdue(uuid)',
    'rpc_apply_punishment_ban(uuid)',
    'rpc_checker_verdict(uuid,text,text)',
    'rpc_claim_ski_award(uuid,text)',
    'rpc_finalize_countdown(uuid)',
    'rpc_get_gamification_leaderboard()',
    'rpc_get_points_leaderboard(integer)',
    'rpc_get_ski_leaderboard(integer)',
    'rpc_record_ski_sample(double precision,double precision,double precision,double precision)',
    'rpc_get_shot_tokens()',
    'rpc_get_all_shot_tokens()',
    'rpc_get_shot_leaderboard(text,integer)',
    'rpc_start_shot_simple(text)',
    'rpc_start_shot_round(text)',
    'rpc_use_frikort(uuid)',
    'rpc_confirm_shot(uuid,text,uuid,text,text)',
    'rpc_check_shot_ban()',
    'rpc_award_points(uuid,integer,text,text)',
    'rpc_admin_adjust_tokens(uuid,integer,text)',
    'rpc_admin_reset_shot_event(uuid)',
    'rpc_admin_resolve_shot(uuid,text,text)',
    'rpc_admin_unban_shot(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY legacy_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- ignore missing overloads
      NULL;
    END;
  END LOOP;
END $$;

-- 3. Revoke access to legacy gamification/ski tables from anon/authenticated.
DO $$
DECLARE
  t text;
  legacy_tables text[] := ARRAY[
    'shot_events','shot_tokens','shot_event_log','token_ledger',
    'points_ledger','user_points','user_frikort','user_streaks',
    'ski_daily_awards','ski_daily_vertical','ski_altitude_samples',
    'ski_speed_records','ski_track_points'
  ];
BEGIN
  FOREACH t IN ARRAY legacy_tables LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- 4. Lock sensitive profile columns from other authenticated users.
--    RLS lets approved members SELECT any profile row, so we must gate
--    sensitive columns at grant level. Own-row access flows via
--    rpc_get_own_profile (SECURITY DEFINER, auth.uid() scoped).
REVOKE SELECT (
  email,
  email_verified,
  email_verification_expires_at,
  banned_at,
  ban_reason,
  approved_at,
  approved_by
) ON public.profiles FROM authenticated;

-- Confirm safe columns remain readable to authenticated (idempotent).
GRANT SELECT (
  id, full_name, nickname, avatar_url, is_active, is_banned,
  membership_status, created_at, updated_at
) ON public.profiles TO authenticated;

-- 5. Trygg egen-profil RPC. Returnerer alle felt for den innloggede brukeren.
CREATE OR REPLACE FUNCTION public.rpc_get_own_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.rpc_get_own_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_own_profile() TO authenticated;

-- 6. Approved-check helper eksponert til klient/edge (used by frontend guard).
GRANT EXECUTE ON FUNCTION public.is_approved_member(uuid) TO authenticated, anon;

-- 7. Sørg for at push_tokens ikke leses av andre enn eier/admin.
--    (Row-level policies allerede satt; strip anon access forsvarlig.)
REVOKE ALL ON TABLE public.push_tokens FROM anon;
