-- ============================================================================
-- PORT 0b — herding av de FAKTISKE privilegerte tur-RPC-ene, arkivgrense for
-- trip_members/user_locations og lovlige statusoverganger.
--
-- CODE ONLY / PENDING: IKKE kjørt mot produksjon.
-- Kjøres ETTER 20260813_port0_trip_model_authz.sql (som definerer hjelperne).
--
-- Invarianter:
--   * Additiv og idempotent. Ingen DROP TABLE, DELETE eller TRUNCATE.
--   * Ingen oppdiktede turdatoer. start_date/end_date røres ikke.
--   * Alle SECURITY DEFINER som skrives her har SET search_path = '' og
--     fullt kvalifiserte objekter (public./auth./pg_catalog.).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Statusmodell: kun 'active' og 'archived', pluss et eksplisitt skille
--    mellom «utkast» (aldri aktivert) og «arkivert» (har vært aktivert).
--    Uten dette blir en nyopprettet tur et uadministrerbart objekt: den er
--    'archived' fra fødselen og ville vært read-only før den kan bemannes.
-- ---------------------------------------------------------------------------

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Konservativ, ikke-destruktiv backfill: alt som finnes fra før regnes som
-- allerede aktivert. Aktive turer får now(); tidligere arkiverte får
-- updated_at slik at de forblir read-only. Kjøres kun én gang per rad.
UPDATE public.trips
   SET activated_at = CASE WHEN status = 'active' THEN now() ELSE updated_at END
 WHERE activated_at IS NULL;

-- Utkast = arkivert og aldri aktivert. Skrivbar tur = aktiv eller utkast.
CREATE OR REPLACE FUNCTION public.is_trip_draft(_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
     WHERE t.id = _trip_id AND t.status = 'archived' AND t.activated_at IS NULL
  )
$$;

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
-- 2. De faktiske tur-RPC-ene, skrevet om med pinnet search_path, fullt
--    kvalifiserte navn og turbundet adminvalidering.
-- ---------------------------------------------------------------------------

-- 2a. Opprett tur: kun godkjent, ikke-banned global admin. Turen fødes som
--     utkast og oppretteren får medlemskap i SAMME transaksjon, slik at den
--     aldri er et uadministrerbart objekt.
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
                            created_by, updated_by, status, activated_at)
  VALUES (p_name, p_destination, p_country, p_timezone, p_currency,
          p_start_date, p_end_date, COALESCE(p_destination_config, '{}'::jsonb),
          v_uid, v_uid, 'archived', NULL)
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

-- 2c. Aktivering er den ENESTE lovlige archived -> active-overgangen, og den
--     arkiverer eksplisitt forrige aktive tur i samme transaksjon.
--     FOR UPDATE-låsen gjør parallell aktivering serialisert; den partielle
--     unike indeksen trips_single_active_idx er siste skanse.
CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);

  -- Lås alle kandidatrader i deterministisk rekkefølge (unngår deadlock).
  PERFORM 1 FROM public.trips t
    WHERE t.status = 'active' OR t.id = p_trip_id
    ORDER BY t.id
    FOR UPDATE;

  UPDATE public.trips SET status = 'archived', updated_by = v_uid, updated_at = now()
    WHERE status = 'active' AND id <> p_trip_id;

  UPDATE public.trips
     SET status = 'active', activated_at = COALESCE(activated_at, now()),
         updated_by = v_uid, updated_at = now()
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
     SET status = 'archived', activated_at = COALESCE(activated_at, now()),
         updated_by = v_uid, updated_at = now()
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

CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_remaining int; v_is_active boolean;
BEGIN
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  SELECT (t.status = 'active') INTO v_is_active FROM public.trips t WHERE t.id = p_trip_id;
  IF v_is_active THEN
    SELECT count(*) INTO v_remaining FROM public.trip_members m
     WHERE m.trip_id = p_trip_id AND m.user_id <> p_user_id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_member_of_active_trip';
    END IF;
  END IF;

  DELETE FROM public.trip_members m
   WHERE m.trip_id = p_trip_id AND m.user_id = p_user_id;
  RETURN true;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Grants: ingen PUBLIC/anon på privilegerte funksjoner.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'rpc_admin_%'
            OR p.proname IN ('active_trip_id','assert_trip_admin','assert_trip_writable',
                             'is_trip_draft','is_trip_writable'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 4. Arkivgrense for trip_members (RESTRICTIVE backstop over eksisterende
--    permissive adminpolicyer — ingen DROP av historikk).
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
-- 5. user_locations: turbundet, eier-skriv, admin-i-samme-tur-lesing.
--
--    KJENT BEGRENSNING (dokumentert, ikke skjult): primærnøkkelen er user_id
--    alene, så én bruker kan bare ha ÉN posisjonsrad totalt — ikke én per tur.
--    Overgangen til (user_id, trip_id) krever backfill av de eksisterende
--    NULL-radene og gjøres IKKE her. Se docs/PORT0_RUNBOOK.md.
--    Eksisterende NULL-rader beholdes urørt og kan fortsatt leses av eier.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_cmd text;
BEGIN
  -- Skriv: eksplisitt ikke-null trip_id, egen rad, skrivbar tur, godkjent
  -- medlemskap i nøyaktig den turen. `trip_id IS NULL` er ALDRI en bypass.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations'
      AND policyname='user_locations_write_scoped_insert') THEN
    CREATE POLICY user_locations_write_scoped_insert ON public.user_locations
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid()
                  AND trip_id IS NOT NULL
                  AND public.can_write_trip(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations'
      AND policyname='user_locations_write_scoped_update') THEN
    CREATE POLICY user_locations_write_scoped_update ON public.user_locations
      AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid()
                  AND trip_id IS NOT NULL
                  AND public.can_write_trip(trip_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations'
      AND policyname='user_locations_delete_own') THEN
    CREATE POLICY user_locations_delete_own ON public.user_locations
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- Lesing: egen rad, ellers turadmin i NØYAKTIG samme tur. Global admin
  -- alene gir ikke lenger innsyn i andres posisjon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations'
      AND policyname='user_locations_read_scoped') THEN
    CREATE POLICY user_locations_read_scoped ON public.user_locations
      AS RESTRICTIVE FOR SELECT TO authenticated
      USING (user_id = auth.uid()
             OR (trip_id IS NOT NULL AND public.is_trip_admin(trip_id, auth.uid())));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;
