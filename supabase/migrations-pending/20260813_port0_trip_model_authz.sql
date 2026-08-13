-- ============================================================================
-- PORT 0 — autoritativ turmodell, gjenbrukbare authz-hjelpere og herding.
--
-- CODE ONLY / PENDING: denne filen er IKKE kjørt mot produksjon.
-- Se docs/PORT0_RUNBOOK.md for rekkefølge, preflight og rollback.
--
-- Invarianter:
--   * Additiv og idempotent: kan kjøres flere ganger uten sideeffekt.
--   * Ingen DROP, DELETE eller TRUNCATE. Ingen historikk røres.
--   * Ingen hemmeligheter eller literal nøkler.
--   * start_date/end_date forblir nullable — ingen oppdiktede defaults
--     (Val Thorens 2027 har fortsatt ukjente datoer).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Turmodell: gyldig IANA-tidssone, gyldig datointervall, én aktiv tur.
-- ---------------------------------------------------------------------------

-- Én aktiv tur. Partiell unik indeks: arkiverte turer er ubegrenset.
CREATE UNIQUE INDEX IF NOT EXISTS trips_single_active_idx
  ON public.trips ((status))
  WHERE status = 'active';

-- Validering som CHECK ikke kan uttrykke (tidssoneoppslag er ikke immutable).
CREATE OR REPLACE FUNCTION public.trips_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.timezone IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid_timezone: %', NEW.timezone
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL
     AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'invalid_date_range: end_date < start_date'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.currency IS NULL OR NEW.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency: %', NEW.currency
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.destination_config IS NULL
     OR jsonb_typeof(NEW.destination_config) <> 'object' THEN
    RAISE EXCEPTION 'invalid_destination_config: must be a json object'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

-- Idempotent uten DROP: opprettes kun hvis triggeren mangler.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trips_validate_trg'
       AND tgrelid = 'public.trips'::regclass
  ) THEN
    CREATE TRIGGER trips_validate_trg
      BEFORE INSERT OR UPDATE ON public.trips
      FOR EACH ROW EXECUTE FUNCTION public.trips_validate();
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Turkontekst på user_locations (additiv, nullable — ingen backfill-gjetning).
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS trip_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_locations_trip_id_fkey'
       AND conrelid = 'public.user_locations'::regclass
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES public.trips(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_locations_trip_id_idx
  ON public.user_locations (trip_id);


-- ---------------------------------------------------------------------------
-- 3. Gjenbrukbare, minst privilegerte authz-hjelpere.
--    Alle er SECURITY DEFINER med pinnet, tom search_path og fullt
--    kvalifiserte objekter — ingen tillit til mutable public-navn.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _trip_id IS NOT NULL AND _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trip_members m
     WHERE m.trip_id = _trip_id AND m.user_id = _user_id
  )
$$;

-- Aktiv, godkjent og ikke utestengt bruker.
CREATE OR REPLACE FUNCTION public.is_approved_member(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _uid
       AND p.membership_status = 'approved'::public.membership_status_type
       AND p.is_active = true
       AND p.is_banned = false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_approved_member(_user_id) AND public.is_trip_member(_trip_id, _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_trip_active(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t WHERE t.id = _trip_id AND t.status = 'active'
  )
$$;

-- Skrivbar tur = turen finnes og er ikke arkivert.
CREATE OR REPLACE FUNCTION public.is_trip_writable(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_trip_active(_trip_id)
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = _user_id AND r.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

-- Admin i riktig tur: admin-rollen alene gir ikke turtilgang.
CREATE OR REPLACE FUNCTION public.is_trip_admin(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_admin(_user_id)
     AND public.is_approved_member(_user_id)
     AND public.is_trip_member(_trip_id, _user_id)
$$;

-- Den ene porten alle skrivebaner skal bruke.
CREATE OR REPLACE FUNCTION public.can_write_trip(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_approved_trip_member(_trip_id, _user_id)
     AND public.is_trip_writable(_trip_id)
$$;

CREATE OR REPLACE FUNCTION public.can_read_trip(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_approved_trip_member(_trip_id, _user_id)
$$;


-- ---------------------------------------------------------------------------
-- 4. Minste nødvendige EXECUTE. PUBLIC/anon mister tilgang overalt.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  -- 4a. Hjelpere som RLS faktisk evaluerer i kallerens kontekst.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'is_trip_member','is_approved_member','is_approved_trip_member',
         'is_trip_active','is_trip_writable','is_trip_admin',
         'can_write_trip','can_read_trip','has_role','is_admin'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;

  -- 4b. Privilegerte/admin-RPC-er: aldri PUBLIC/anon. Funksjonene validerer
  --     fortsatt admin internt; grant er bare første lag.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'rpc_admin_%' OR p.proname = 'active_trip_id')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- active_trip_id skal ikke være en anonym oppdagelsesvei.
REVOKE ALL ON FUNCTION public.active_trip_id() FROM PUBLIC, anon;


-- ---------------------------------------------------------------------------
-- 5. Arkivgrense som backstop i databasen.
--    RESTRICTIVE-policy: arkivert tur kan leses, men aldri skrives — uansett
--    hva klienten gjør. Legges kun på tabeller som faktisk har trip_id.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_tbl text;
DECLARE v_cmd text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'agenda_events','messages','gallery_items','gallery_comments',
    'stories','polls','rounds','debt_settlements'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'trip_id'
    ) THEN CONTINUE; END IF;

    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = v_tbl
           AND policyname = format('archive_readonly_%s', lower(v_cmd))
      ) THEN
        IF v_cmd = 'INSERT' THEN
          EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
            || 'WITH CHECK (trip_id IS NULL OR public.is_trip_writable(trip_id))',
            format('archive_readonly_%s', lower(v_cmd)), v_tbl);
        ELSE
          EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated '
            || 'USING (trip_id IS NULL OR public.is_trip_writable(trip_id))',
            format('archive_readonly_%s', lower(v_cmd)), v_tbl, v_cmd);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 6. Realtime-publication: eksakt det koden abonnerer på. Idempotent.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH v_tbl IN ARRAY ARRAY[
    'trips','messages','chat_reads','message_reactions','agenda_events',
    'polls','poll_votes','rounds','round_participants','stories','story_views',
    'gallery_items','gallery_likes','gallery_comments','user_locations'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
    END IF;
  END LOOP;
END $$;
