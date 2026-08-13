-- ============================================================================
-- PORT 0 — atferdstester mot ekte, isolert Postgres.
-- Hver test hever exception ved brudd, så hele filen feiler høylytt.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public._assert(cond boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

-- --------------------------------------------------------------------------
-- Testdata
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t_active uuid := '11111111-1111-1111-1111-111111111111';
  t_arch   uuid := '22222222-2222-2222-2222-222222222222';
  t_other  uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  INSERT INTO public.trips (id,name,destination,timezone,currency,status)
  VALUES (t_active,'Aktiv','Val Thorens','Europe/Paris','EUR','active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.trips (id,name,destination,timezone,currency,status)
  VALUES (t_arch,'Arkiv','Arkivsted','Europe/Oslo','NOK','archived')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.trips (id,name,destination,timezone,currency,status)
  VALUES (t_other,'Annen','Annet','Europe/Zurich','CHF','archived')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id,email,membership_status,is_active,is_banned) VALUES
    ('a0000000-0000-0000-0000-000000000001','member@x','approved',true,false),
    ('a0000000-0000-0000-0000-000000000002','admin@x','approved',true,false),
    ('a0000000-0000-0000-0000-000000000003','pending@x','pending',true,false),
    ('a0000000-0000-0000-0000-000000000004','banned@x','banned',true,true),
    ('a0000000-0000-0000-0000-000000000005','other@x','approved',true,false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('a0000000-0000-0000-0000-000000000002','admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.trip_members (trip_id,user_id) VALUES
    (t_active,'a0000000-0000-0000-0000-000000000001'),
    (t_active,'a0000000-0000-0000-0000-000000000002'),
    (t_active,'a0000000-0000-0000-0000-000000000003'),
    (t_active,'a0000000-0000-0000-0000-000000000004'),
    (t_arch  ,'a0000000-0000-0000-0000-000000000001'),
    (t_other ,'a0000000-0000-0000-0000-000000000005')
  ON CONFLICT DO NOTHING;
END $$;

-- --------------------------------------------------------------------------
-- 1. Authz-hjelpere: medlem, admin, pending, banned, annen tur
-- --------------------------------------------------------------------------
SELECT public._assert(public.can_write_trip('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001'), 'godkjent medlem kan skrive i aktiv tur');
SELECT public._assert(public.is_trip_admin('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002'), 'admin er admin i egen tur');
SELECT public._assert(NOT public.is_trip_admin('33333333-3333-3333-3333-333333333333','a0000000-0000-0000-0000-000000000002'), 'admin er ikke admin i tur uten medlemskap');
SELECT public._assert(NOT public.can_write_trip('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003'), 'pending medlem kan ikke skrive');
SELECT public._assert(NOT public.can_write_trip('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000004'), 'banned bruker kan ikke skrive');
SELECT public._assert(NOT public.can_read_trip('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000005'), 'medlem av annen tur har ingen tilgang');
SELECT public._assert(NOT public.can_write_trip('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001'), 'arkivert tur er ikke skrivbar');
SELECT public._assert(public.can_read_trip('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001'), 'arkivert tur er lesbar');

-- --------------------------------------------------------------------------
-- 2. RLS: reell skriving som authenticated
-- --------------------------------------------------------------------------
DO $$
DECLARE v_err text;
BEGIN
  -- Godkjent medlem, aktiv tur -> OK
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', true);
  INSERT INTO public.agenda_events (trip_id,title,created_by)
  VALUES ('11111111-1111-1111-1111-111111111111','Aktiv hendelse','a0000000-0000-0000-0000-000000000001');
  RESET ROLE;
  PERFORM public._assert(true,'RLS: medlem kan skrive i aktiv tur');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE EXCEPTION 'FAIL: medlem kunne ikke skrive i aktiv tur (%)', SQLERRM;
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', true);
  BEGIN
    INSERT INTO public.agenda_events (trip_id,title,created_by)
    VALUES ('22222222-2222-2222-2222-222222222222','Arkivskriving','a0000000-0000-0000-0000-000000000001');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN ok := true;
  END;
  RESET ROLE;
  PERFORM public._assert(ok,'RLS: arkivert tur blokkerer INSERT (RESTRICTIVE backstop)');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005', true);
  BEGIN
    INSERT INTO public.agenda_events (trip_id,title,created_by)
    VALUES ('11111111-1111-1111-1111-111111111111','Lekkasje','a0000000-0000-0000-0000-000000000005');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN ok := true;
  END;
  RESET ROLE;
  PERFORM public._assert(ok,'RLS: medlem av annen tur kan ikke skrive');
END $$;

DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005', true);
  SELECT count(*) INTO n FROM public.agenda_events;
  RESET ROLE;
  PERFORM public._assert(n = 0,'RLS: ingen turlekkasje ved SELECT for annen tur');
END $$;

DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004', true);
  SELECT count(*) INTO n FROM public.agenda_events;
  RESET ROLE;
  PERFORM public._assert(n = 0,'RLS: banned bruker ser ingenting');
END $$;

DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003', true);
  SELECT count(*) INTO n FROM public.agenda_events;
  RESET ROLE;
  PERFORM public._assert(n = 0,'RLS: pending medlem ser ingenting');
END $$;

-- --------------------------------------------------------------------------
-- 3. Turmodell: tidssone, datointervall, én aktiv tur, statusovergang
-- --------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.trips (name,destination,timezone,currency)
    VALUES ('Ugyldig tz','X','Europe/Nowhere','EUR');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM public._assert(ok,'ugyldig IANA-tidssone avvises');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.trips (name,destination,timezone,currency,start_date,end_date)
    VALUES ('Ugyldig dato','X','Europe/Paris','EUR','2027-03-10','2027-03-01');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM public._assert(ok,'ugyldig datointervall avvises');
END $$;

DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.trips (name,destination,timezone,currency)
  VALUES ('Ukjente datoer','Val Thorens','Europe/Paris','EUR') RETURNING id INTO v_id;
  PERFORM public._assert(
    (SELECT start_date IS NULL AND end_date IS NULL FROM public.trips WHERE id = v_id),
    'nullable datoer beholdes uten oppdiktet default');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.trips (name,destination,timezone,currency,status)
    VALUES ('Aktiv nummer to','X','Europe/Paris','EUR','active');
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  PERFORM public._assert(ok,'kun én aktiv tur er mulig');
END $$;

DO $$
BEGIN
  -- Statusovergang via admin-RPC: aktiv flyttes atomisk.
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002', true);
  PERFORM public.rpc_admin_set_active_trip('22222222-2222-2222-2222-222222222222');
  PERFORM public._assert((SELECT count(*) FROM public.trips WHERE status='active') = 1,
    'statusovergang bevarer nøyaktig én aktiv tur');
  PERFORM public.rpc_admin_set_active_trip('11111111-1111-1111-1111-111111111111');
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', true);
  BEGIN
    PERFORM public.rpc_admin_set_active_trip('22222222-2222-2222-2222-222222222222');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  PERFORM public._assert(ok,'ikke-admin avvises inne i admin-RPC (ikke bare av grants)');
END $$;

-- --------------------------------------------------------------------------
-- 4. Grants / revokes / SECURITY DEFINER search_path
-- --------------------------------------------------------------------------
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('is_trip_member','is_approved_member','is_approved_trip_member',
                       'is_trip_active','is_trip_writable','is_trip_admin','can_write_trip',
                       'can_read_trip','has_role','is_admin','active_trip_id',
                       'rpc_admin_set_active_trip')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  PERFORM public._assert(bad IS NULL, coalesce('anon/PUBLIC har fortsatt EXECUTE på: '||bad,
    'anon/PUBLIC har ingen EXECUTE på privilegerte funksjoner'));
END $$;

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('is_trip_member','can_write_trip','can_read_trip','is_trip_admin')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  PERFORM public._assert(missing IS NULL, coalesce('authenticated mangler EXECUTE: '||missing,
    'authenticated har nøyaktig den EXECUTE RLS trenger'));
END $$;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND p.proname IN ('is_trip_member','is_approved_member','is_approved_trip_member',
                       'is_trip_active','is_trip_writable','is_trip_admin','can_write_trip',
                       'can_read_trip','has_role','is_admin','trips_validate')
     AND NOT ('search_path=' = ANY (coalesce(p.proconfig, ARRAY[]::text[])));
  PERFORM public._assert(bad IS NULL, coalesce('mangler pinnet tom search_path: '||bad,
    'alle Port-0 SECURITY DEFINER har pinnet tom search_path'));
END $$;

-- --------------------------------------------------------------------------
-- 5. Skjema og realtime
-- --------------------------------------------------------------------------
SELECT public._assert(EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='user_locations' AND column_name='trip_id'
), 'user_locations har trip_id');

SELECT public._assert(
  (SELECT count(*) FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='agenda_events') = 1,
  'realtime-publication inneholder agenda_events nøyaktig én gang');

SELECT public._assert(
  (SELECT count(*) FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trips') = 1,
  'realtime-publication inneholder trips nøyaktig én gang');
