-- ============================================================================
-- 20260816b — TURLAGRING: entydig patch-semantikk, trygge tur-RPC-er og
--             Realtime for trips/trip_members.
--
-- CODE ONLY / PENDING: ikke kjørt mot den delte appdatabasen.
-- Rekkefølge: 20260816a_trip_status_draft.sql -> DENNE.
--
-- Hvorfor: rpc_admin_update_trip bruker COALESCE. Et eksplisitt NULL kan
-- derfor ikke TØMME dato eller land — feltet beholder gammel verdi og appen
-- lyver om at lagringen lyktes. Vi kan ikke endre COALESCE-semantikken uten å
-- brekke eldre klienter som sender NULL for «ikke rørt».
--
-- Løsning: en NY, tydelig RPC med JSON-patch.
--     nøkkel til stede med verdi   -> sett verdien
--     nøkkel til stede med null    -> TØM feltet (kun nullbare felt)
--     nøkkel utelatt               -> behold feltet uendret
-- Gammel rpc_admin_update_trip beholdes uendret for bakoverkompatibilitet.
--
-- Avgrensning: INGEN skjemaendring på user_locations, ingen PK-bytte, ingen
-- sletting, ingen backfill, ingen oppdiktede turdatoer. Eksisterende tur,
-- medlemskap og NULL-datoer bevares.
--
-- Idempotent: hele filen kan kjøres to ganger på rad uten at en eneste rad
-- endrer status, skrivbarhet eller innhold.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Autorisasjonshjelpere (produksjonskompatible kropper, pinnet search_path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_approved_member(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _uid
       AND p.is_active IS TRUE
       AND p.is_banned IS NOT TRUE
       AND p.membership_status = 'approved'::public.membership_status_type
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members m
     WHERE m.trip_id = _trip_id AND m.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trip_active(_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
     WHERE t.id = _trip_id AND t.status = 'active'::public.trip_status
  )
$$;

-- Skrivbar = alt som IKKE er arkivert (active og draft). Uttrykt som negasjon
-- slik at funksjonen er korrekt både før og etter at 'draft' finnes.
CREATE OR REPLACE FUNCTION public.is_trip_writable(_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
     WHERE t.id = _trip_id AND t.status <> 'archived'::public.trip_status
  )
$$;

-- Turadmin = godkjent, aktivt, ikke-banna medlem AV DENNE TUREN med admin-rolle.
CREATE OR REPLACE FUNCTION public.is_trip_admin(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_approved_member(_user_id)
     AND public.has_role(_user_id, 'admin'::public.app_role)
     AND public.is_trip_member(_trip_id, _user_id)
$$;

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
-- 2. Invarianter på trips: nøyaktig én aktiv tur, gyldig datointervall.
--    Datosjekken legges til NOT VALID: nye skrivinger valideres, eksisterende
--    historikk røres ikke.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS trips_single_active_idx
  ON public.trips ((status))
  WHERE status = 'active'::public.trip_status;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'trips_date_range_chk'
       AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_date_range_chk
      CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
      NOT VALID;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. NY autoritativ lagringsvei: rpc_admin_patch_trip(uuid, jsonb).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_patch_trip(p_trip_id uuid, p_patch jsonb)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid    uuid;
  v_row    public.trips;
  v_key    text;
  v_allowed text[] := ARRAY['name','destination','country','timezone','currency',
                            'start_date','end_date','destination_config'];
  v_start  date;
  v_end    date;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'unknown_field_%', v_key USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  -- Obligatoriske felt kan settes, men aldri tømmes.
  FOREACH v_key IN ARRAY ARRAY['name','destination','timezone','currency','destination_config'] LOOP
    IF p_patch ? v_key AND (p_patch->v_key = 'null'::jsonb) THEN
      RAISE EXCEPTION 'field_not_nullable_%', v_key USING ERRCODE = 'not_null_violation';
    END IF;
  END LOOP;
  IF p_patch ? 'name' AND pg_catalog.btrim(p_patch->>'name') = '' THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'destination' AND pg_catalog.btrim(p_patch->>'destination') = '' THEN
    RAISE EXCEPTION 'destination_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'timezone' AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_patch->>'timezone') THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'currency' AND p_patch->>'currency' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'destination_config'
     AND pg_catalog.jsonb_typeof(p_patch->'destination_config') <> 'object' THEN
    RAISE EXCEPTION 'destination_config_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_row FROM public.trips t WHERE t.id = p_trip_id FOR UPDATE;

  -- Datointervallet valideres mot den SAMMENSATTE tilstanden etter patchen,
  -- slik at «tøm startdato» og «sett sluttdato» vurderes sammen.
  v_start := CASE WHEN p_patch ? 'start_date'
                  THEN NULLIF(p_patch->>'start_date','')::date ELSE v_row.start_date END;
  v_end   := CASE WHEN p_patch ? 'end_date'
                  THEN NULLIF(p_patch->>'end_date','')::date ELSE v_row.end_date END;
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_start > v_end THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.trips SET
    name        = CASE WHEN p_patch ? 'name' THEN pg_catalog.btrim(p_patch->>'name') ELSE name END,
    destination = CASE WHEN p_patch ? 'destination' THEN pg_catalog.btrim(p_patch->>'destination') ELSE destination END,
    country     = CASE WHEN p_patch ? 'country' THEN NULLIF(pg_catalog.btrim(COALESCE(p_patch->>'country','')),'') ELSE country END,
    timezone    = CASE WHEN p_patch ? 'timezone' THEN p_patch->>'timezone' ELSE timezone END,
    currency    = CASE WHEN p_patch ? 'currency' THEN p_patch->>'currency' ELSE currency END,
    start_date  = v_start,
    end_date    = v_end,
    destination_config = CASE WHEN p_patch ? 'destination_config'
                              THEN p_patch->'destination_config' ELSE destination_config END,
    updated_by  = v_uid,
    updated_at  = now()
  WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_updated',
          pg_catalog.jsonb_build_object('trip_id', p_trip_id,
                                        'fields', (SELECT pg_catalog.jsonb_agg(k)
                                                     FROM pg_catalog.jsonb_object_keys(p_patch) k)));
  RETURN v_row;
END $$;


-- ---------------------------------------------------------------------------
-- 4. Livssyklus: create (draft), aktivering (atomisk), arkivering (idempotent).
--    Signaturene er uendret, så eksisterende klienter treffer samme navn.
-- ---------------------------------------------------------------------------

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
  IF NOT (public.has_role(v_uid,'admin'::public.app_role) AND public.is_approved_member(v_uid)) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'check_violation';
  END IF;

  -- Ny tur fødes som UTKAST (aldri en andre aktiv tur), og oppretteren blir
  -- turadmin i SAMME transaksjon.
  INSERT INTO public.trips (name, destination, country, timezone, currency,
                            start_date, end_date, destination_config,
                            created_by, updated_by, status)
  VALUES (pg_catalog.btrim(p_name), pg_catalog.btrim(p_destination), p_country,
          p_timezone, p_currency, p_start_date, p_end_date,
          COALESCE(p_destination_config, '{}'::jsonb),
          v_uid, v_uid, 'draft'::public.trip_status)
  RETURNING * INTO v_row;

  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (v_row.id, v_uid, v_uid) ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_created',
          pg_catalog.jsonb_build_object('trip_id', v_row.id, 'name', v_row.name));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);

  PERFORM 1 FROM public.trips t
    WHERE t.status = 'active'::public.trip_status OR t.id = p_trip_id
    ORDER BY t.id FOR UPDATE;

  UPDATE public.trips
     SET status = 'archived'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE status = 'active'::public.trip_status AND id <> p_trip_id;

  UPDATE public.trips
     SET status = 'active'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_activated', pg_catalog.jsonb_build_object('trip_id', p_trip_id));
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

-- Arkivering: aktiv tur kan ikke arkiveres direkte (appen ville stå uten aktiv
-- tur). Allerede arkivert tur returneres HELT uendret: ingen UPDATE, ingen ny
-- updated_at og ingen ny auditrad.
CREATE OR REPLACE FUNCTION public.rpc_admin_archive_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_row public.trips;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);

  SELECT * INTO v_row FROM public.trips t WHERE t.id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.status = 'active'::public.trip_status THEN
    RAISE EXCEPTION 'cannot_archive_active_trip'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Aktiver en annen tur i stedet — det arkiverer denne automatisk.';
  END IF;

  IF v_row.status = 'archived'::public.trip_status THEN
    RETURN v_row;
  END IF;

  UPDATE public.trips
     SET status = 'archived'::public.trip_status, updated_by = v_uid, updated_at = now()
   WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_archived', pg_catalog.jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

-- Medlemsadministrasjon: turadmin i riktig tur + skrivbar tur. Siste turadmin
-- kan aldri fjernes.
CREATE OR REPLACE FUNCTION public.rpc_admin_add_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);
  IF p_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (p_trip_id, p_user_id, v_uid) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid; v_admins_left int;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  SELECT count(*) INTO v_admins_left
    FROM public.trip_members m
   WHERE m.trip_id = p_trip_id
     AND m.user_id <> p_user_id
     AND public.is_trip_admin(p_trip_id, m.user_id);

  IF v_admins_left = 0 THEN
    RAISE EXCEPTION 'cannot_remove_last_trip_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.trip_members m
   WHERE m.trip_id = p_trip_id AND m.user_id = p_user_id;
  RETURN true;
END $$;


-- ---------------------------------------------------------------------------
-- 5. Grants: eksplisitt allowlist. Ingen wildcard, ingen legacy-funksjoner.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('rpc_admin_patch_trip','rpc_admin_create_trip',
                         'rpc_admin_update_trip','rpc_admin_set_active_trip',
                         'rpc_admin_activate_trip','rpc_admin_archive_trip',
                         'rpc_admin_add_trip_member','rpc_admin_remove_trip_member',
                         'is_trip_member','is_trip_admin','is_trip_writable',
                         'is_trip_active','is_approved_member',
                         'assert_trip_admin','assert_trip_writable')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 6. Arkiv er read-only også ved DIREKTE tabellskriving.
--    RESTRICTIVE tillegg: den eksisterende permissive adminpolicyen kan ikke
--    lenger brukes til å endre en arkivert tur utenom RPC. Aktive turer og
--    utkast skriver som før -> bakoverkompatibelt for eldre klienter.
-- ---------------------------------------------------------------------------

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE v_cmd text;
BEGIN
  FOREACH v_cmd IN ARRAY ARRAY['UPDATE','DELETE'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='trips'
                      AND policyname = format('trips_archive_readonly_%s', lower(v_cmd))) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.trips AS RESTRICTIVE FOR %s TO authenticated '
        || 'USING (status <> ''archived''::public.trip_status)',
        format('trips_archive_readonly_%s', lower(v_cmd)), v_cmd);
    END IF;
  END LOOP;

  FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='trip_members'
                      AND policyname = format('trip_members_archive_readonly_%s', lower(v_cmd))) THEN
      IF v_cmd = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.trip_members AS RESTRICTIVE FOR INSERT TO authenticated '
          || 'WITH CHECK (public.is_trip_writable(trip_id))',
          format('trip_members_archive_readonly_%s', lower(v_cmd)));
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.trip_members AS RESTRICTIVE FOR %s TO authenticated '
          || 'USING (public.is_trip_writable(trip_id))',
          format('trip_members_archive_readonly_%s', lower(v_cmd)), v_cmd);
      END IF;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 7. Realtime: trips og trip_members må kringkastes, ellers ser ikke enhet nr.
--    2 en lagret tur før manuell reload. REPLICA IDENTITY FULL gir hele raden
--    i payloaden (nødvendig for UPDATE og DELETE).
-- ---------------------------------------------------------------------------

ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER TABLE public.trip_members REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trips') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trip_members') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_members;
    END IF;
  END IF;
END $$;
