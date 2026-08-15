-- ============================================================================
-- PORT 0c — herding av de FAKTISKE privilegerte tur-RPC-ene, RPC som eneste
-- autoritative mutasjonsvei, og ekte fler-tur-modell for user_locations.
--
-- CODE ONLY / PENDING: IKKE kjørt mot produksjon.
-- Rekkefølge: 20260813 -> 20260814 (enum) -> DENNE.
--
-- Invarianter:
--   * Additiv og idempotent: to kjøringer på rad endrer ingen rads status,
--     skrivbarhet eller data.
--   * Ingen DROP TABLE, DROP FUNCTION, DELETE eller TRUNCATE. Den ENESTE
--     strukturelle nedbyggingen er bytte av primærnøkkel på user_locations
--     (PK(user_id) -> PK(id) + UNIQUE(trip_id,user_id)) — ingen rader røres.
--   * Ingen oppdiktede turdatoer. start_date/end_date røres ikke.
--   * Alle SECURITY DEFINER her: SET search_path = '' + fullt kvalifiserte navn
--     + intern autorisasjon (auth.uid, approved, ikke banned, rolle, tur).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Statusmodell: draft (ny, redigerbar) / active (én) / archived (read-only).
--
--    Ingen backfill. Eksisterende rader beholder sin status for alltid, og
--    'draft' oppstår kun via rpc_admin_create_trip. Derfor er filen trygg å
--    kjøre to ganger: ingen rad kan bytte skrivbarhet ved andre kjøring.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_trip_draft(_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
     WHERE t.id = _trip_id AND t.status = 'draft'::public.trip_status
  )
$$;

-- Skrivbar tur = aktiv eller utkast. Arkivert er permanent read-only, med
-- ÉN eksplisitt unntaksovergang: reaktivering via rpc_admin_set_active_trip.
CREATE OR REPLACE FUNCTION public.is_trip_writable(_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_trip_active(_trip_id) OR public.is_trip_draft(_trip_id)
$$;

-- Én port for privilegerte turmutasjoner: godkjent, aktiv, ikke-banned admin
-- som faktisk er medlem av NØYAKTIG denne turen.
CREATE OR REPLACE FUNCTION public.assert_trip_admin(_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = _trip_id) THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.is_approved_member(v_uid) THEN
    RAISE EXCEPTION 'not_approved_member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_trip_admin(_trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_uid;
END $$;

CREATE OR REPLACE FUNCTION public.assert_trip_writable(_trip_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_trip_writable(_trip_id) THEN
    RAISE EXCEPTION 'trip_archived_read_only' USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. De faktiske tur-RPC-ene.
-- ---------------------------------------------------------------------------

-- 2a. Opprett tur: godkjent, ikke-banned global admin. Turen fødes som UTKAST
--     og oppretteren blir medlem i SAMME transaksjon — aldri et
--     uadministrerbart objekt, og aldri en andre aktiv tur.
CREATE OR REPLACE FUNCTION public.rpc_admin_create_trip(
  p_name text,
  p_destination text,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'Europe/Paris',
  p_currency text DEFAULT 'EUR',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT '{}'::jsonb
)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.is_admin(v_uid) AND public.is_approved_member(v_uid)) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.trips (name, destination, country, timezone, currency,
                            start_date, end_date, destination_config,
                            created_by, updated_by, status)
  VALUES (p_name, p_destination, p_country, p_timezone, p_currency,
          p_start_date, p_end_date, COALESCE(p_destination_config, '{}'::jsonb),
          v_uid, v_uid, 'draft'::public.trip_status)
  RETURNING * INTO v_row;

  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (v_row.id, v_uid, v_uid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_created',
          jsonb_build_object('trip_id', v_row.id, 'name', p_name));
  RETURN v_row;
END $$;

-- 2b. Oppdater tur: turadmin i riktig tur, og turen må være skrivbar.
CREATE OR REPLACE FUNCTION public.rpc_admin_update_trip(
  p_trip_id uuid,
  p_name text DEFAULT NULL,
  p_destination text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT NULL
)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  UPDATE public.trips SET
    name = COALESCE(p_name, name),
    destination = COALESCE(p_destination, destination),
    country = COALESCE(p_country, country),
    timezone = COALESCE(p_timezone, timezone),
    currency = COALESCE(p_currency, currency),
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date),
    destination_config = COALESCE(p_destination_config, destination_config),
    updated_by = v_uid, updated_at = now()
  WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_updated', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

-- 2c. Aktivering er den ENESTE lovlige overgangen inn til 'active', og den
--     arkiverer forrige aktive tur i samme transaksjon.
--     Samtidighet: transaksjonsbundet advisory lock serialiserer to parallelle
--     aktiveringer; FOR UPDATE og den partielle unike indeksen
--     trips_single_active_idx er andre og tredje skanse.
CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);

  -- Global serialisering av «hvem er aktiv tur»-overgangen.
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);

  PERFORM 1 FROM public.trips t
    WHERE t.status = 'active'::public.trip_status OR t.id = p_trip_id
    ORDER BY t.id
    FOR UPDATE;

  UPDATE public.trips
     SET status = 'archived'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE status = 'active'::public.trip_status AND id <> p_trip_id;

  UPDATE public.trips
     SET status = 'active'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE id = p_trip_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_activated', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_activate_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_row public.trips;
BEGIN
  SELECT * INTO v_row FROM public.rpc_admin_set_active_trip(p_trip_id);
  RETURN v_row;
END $$;

-- 2d. Arkivering: aktiv tur kan ikke arkiveres direkte (da ville appen stå
--     uten aktiv tur). Utkast kan arkiveres eksplisitt.
CREATE OR REPLACE FUNCTION public.rpc_admin_archive_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips; v_status text;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);

  SELECT t.status::text INTO v_status FROM public.trips t WHERE t.id = p_trip_id;
  IF v_status = 'active' THEN
    RAISE EXCEPTION 'cannot_archive_active_trip'
      USING HINT = 'Aktiver en annen tur i stedet — det arkiverer denne automatisk.';
  END IF;

  UPDATE public.trips
     SET status = 'archived'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_archived', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

-- 2e. Medlemsadministrasjon: turadmin i riktig tur + skrivbar tur.
CREATE OR REPLACE FUNCTION public.rpc_admin_add_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  IF p_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (p_trip_id, p_user_id, v_uid)
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- Fjerning kan ALDRI etterlate turen uten kvalifisert turadmin (godkjent,
-- ikke banned, admin-rolle, medlem av turen). Gjelder også self-remove.
CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_admins_left int;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  SELECT count(*) INTO v_admins_left
    FROM public.trip_members m
   WHERE m.trip_id = p_trip_id
     AND m.user_id <> p_user_id
     AND public.is_trip_admin(p_trip_id, m.user_id);

  IF v_admins_left = 0 THEN
    RAISE EXCEPTION 'cannot_remove_last_trip_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.trip_members m
   WHERE m.trip_id = p_trip_id AND m.user_id = p_user_id;
  RETURN true;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Grants: EKSPLISITT allowlist. Ingen wildcard på rpc_admin_%.
--    Legacy/gamification-RPC-er (tokens, shot, ski, poeng) røres ikke og
--    forblir avlåst.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'rpc_admin_create_trip','rpc_admin_update_trip','rpc_admin_set_active_trip',
         'rpc_admin_activate_trip','rpc_admin_archive_trip',
         'rpc_admin_add_trip_member','rpc_admin_remove_trip_member',
         'active_trip_id','assert_trip_admin','assert_trip_writable',
         'is_trip_draft','is_trip_writable'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 4. RPC som ENESTE autoritative mutasjonsvei mot trips.
--    Den eksisterende permissive «Admins manage trips»-policyen kan ikke
--    lenger brukes til å omgå statusmodellen: en konvergent RESTRICTIVE deny
--    stenger direkte INSERT/UPDATE/DELETE for authenticated. SECURITY
--    DEFINER-RPC-ene eier tabellen og validerer selv, så de går klar.
--    SELECT er urørt (medlemslesing beholdes).
-- ---------------------------------------------------------------------------

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_cmd text;
BEGIN
  FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='trips'
         AND policyname = format('trips_rpc_only_%s', lower(v_cmd))
    ) THEN
      IF v_cmd = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.trips AS RESTRICTIVE FOR INSERT TO authenticated '
          || 'WITH CHECK (false)', format('trips_rpc_only_%s', lower(v_cmd)));
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.trips AS RESTRICTIVE FOR %s TO authenticated '
          || 'USING (false)', format('trips_rpc_only_%s', lower(v_cmd)), v_cmd);
      END IF;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 5. trip_members: direkte skriving krever turadmin OG skrivbar tur.
-- ---------------------------------------------------------------------------

ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_cmd text;
BEGIN
  FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'trip_members'
         AND policyname = format('trip_members_archive_readonly_%s', lower(v_cmd))
    ) THEN
      IF v_cmd = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.trip_members AS RESTRICTIVE FOR INSERT TO authenticated '
          || 'WITH CHECK (public.is_trip_writable(trip_id) AND public.is_trip_admin(trip_id, auth.uid()))',
          format('trip_members_archive_readonly_%s', lower(v_cmd)));
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.trip_members AS RESTRICTIVE FOR %s TO authenticated '
          || 'USING (public.is_trip_writable(trip_id) AND public.is_trip_admin(trip_id, auth.uid()))',
          format('trip_members_archive_readonly_%s', lower(v_cmd)), v_cmd);
      END IF;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 6. user_locations: ekte fler-tur-modell UTEN datatap.
--
--    Preflight (bekreftet mot produksjon): tabellen har kun PRIMARY KEY
--    (user_id) og INGEN innkommende fremmednøkler. Overgangen til surrogat-PK
--    er derfor trygg og rører ingen rader. De 8 legacy-radene med
--    trip_id IS NULL beholdes urørt: eier kan lese dem, men de kan aldri
--    skrives eller brukes som cross-trip-bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

DO $$
DECLARE v_pk text;
BEGIN
  SELECT c.conname INTO v_pk
    FROM pg_constraint c
   WHERE c.conrelid = 'public.user_locations'::regclass AND c.contype = 'p';

  -- Bytt kun hvis PK fortsatt er den gamle (user_id).
  IF v_pk IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = v_pk AND c.conrelid = 'public.user_locations'::regclass
       AND (SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) k JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['user_id']
  ) THEN
    EXECUTE format('ALTER TABLE public.user_locations DROP CONSTRAINT %I', v_pk);
    v_pk := NULL;
  END IF;

  IF v_pk IS NULL THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_locations_trip_user_key'
       AND conrelid = 'public.user_locations'::regclass
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_trip_user_key UNIQUE (trip_id, user_id);
  END IF;
END $$;

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- 6a. PERMISSIVE: vanlige medlemmer får faktisk adgang til egen rad.
  --     (RESTRICTIVE alene gir aldri adgang.)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_own_select') THEN
    CREATE POLICY user_locations_own_select ON public.user_locations
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_trip_admin_select') THEN
    CREATE POLICY user_locations_trip_admin_select ON public.user_locations
      FOR SELECT TO authenticated
      USING (trip_id IS NOT NULL AND public.is_trip_admin(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_own_insert') THEN
    CREATE POLICY user_locations_own_insert ON public.user_locations
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_own_update') THEN
    CREATE POLICY user_locations_own_update ON public.user_locations
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_own_delete') THEN
    CREATE POLICY user_locations_own_delete ON public.user_locations
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- 6b. RESTRICTIVE guards: eier, ikke-null trip_id, skrivbar tur, godkjent
  --     medlemskap i NØYAKTIG den turen. Global admin gir ingen bypass.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_write_scoped_insert') THEN
    CREATE POLICY user_locations_write_scoped_insert ON public.user_locations
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid()
                  AND trip_id IS NOT NULL
                  AND public.can_write_trip(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_write_scoped_update') THEN
    CREATE POLICY user_locations_write_scoped_update ON public.user_locations
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid()
                  AND trip_id IS NOT NULL
                  AND public.can_write_trip(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_delete_scoped') THEN
    CREATE POLICY user_locations_delete_scoped ON public.user_locations
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (user_id = auth.uid()
             AND trip_id IS NOT NULL
             AND public.can_write_trip(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='user_locations' AND policyname='user_locations_read_scoped') THEN
    CREATE POLICY user_locations_read_scoped ON public.user_locations
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (user_id = auth.uid()
             OR (trip_id IS NOT NULL AND public.is_trip_admin(trip_id, auth.uid())));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;
