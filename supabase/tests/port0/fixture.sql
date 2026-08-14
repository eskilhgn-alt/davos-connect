-- ============================================================================
-- TEST-FIKSTUR (kun for isolert lokal Postgres). Aldri kjørt mot produksjon.
--
-- Gjenskaper den minimale, produksjonsformede flaten Port 0 trenger:
--   * Supabase-rollene anon / authenticated / service_role
--   * auth-skjema med auth.uid() styrt av en session-variabel
--   * trips / trip_members / profiles / user_roles / user_locations
--   * én turfølsom tabell (agenda_events) med RLS bygget på Port-0-hjelperne
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('user','admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status_type') THEN
    CREATE TYPE public.membership_status_type AS ENUM ('pending','approved','banned');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_status') THEN
    CREATE TYPE public.trip_status AS ENUM ('active','archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  nickname text,
  is_active boolean NOT NULL DEFAULT true,
  is_banned boolean NOT NULL DEFAULT false,
  membership_status public.membership_status_type NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  destination text NOT NULL,
  country text,
  timezone text NOT NULL,
  currency text NOT NULL,
  start_date date,
  end_date date,
  status public.trip_status NOT NULL DEFAULT 'archived',
  destination_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  user_id uuid NOT NULL,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id uuid PRIMARY KEY,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  title text NOT NULL,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT SELECT ON public.trips, public.trip_members, public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Produksjonsformede (brede) permissive policyer — nøyaktig den flaten som
-- finnes i produksjon i dag. Port 0b skal konvergere dette med RESTRICTIVE
-- backstops uten å slette historikk.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_members' AND policyname='trip_members_admin_all') THEN
    CREATE POLICY trip_members_admin_all ON public.trip_members FOR ALL TO authenticated
      USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_members' AND policyname='trip_members_self_read') THEN
    CREATE POLICY trip_members_self_read ON public.trip_members FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_locations' AND policyname='user_locations_admin_all') THEN
    CREATE POLICY user_locations_admin_all ON public.user_locations FOR ALL TO authenticated
      USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_locations' AND policyname='user_locations_self_all') THEN
    CREATE POLICY user_locations_self_all ON public.user_locations FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Produksjonsformede tur-RPC-er: global is_admin, search_path = public, ingen
-- arkivgrense. Port 0b skal ERSTATTE nøyaktig disse (oppgraderingstesten).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_create_trip(
  p_name text, p_destination text, p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'Europe/Paris', p_currency text DEFAULT 'EUR',
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT '{}'::jsonb)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.trips (name, destination, country, timezone, currency,
                            start_date, end_date, destination_config,
                            created_by, updated_by, status)
  VALUES (p_name, p_destination, p_country, p_timezone, p_currency,
          p_start_date, p_end_date, COALESCE(p_destination_config,'{}'::jsonb),
          v_uid, v_uid, 'archived')
  RETURNING * INTO v_row;
  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (v_row.id, v_uid, v_uid) ON CONFLICT DO NOTHING;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_trip(
  p_trip_id uuid, p_name text DEFAULT NULL, p_destination text DEFAULT NULL,
  p_country text DEFAULT NULL, p_timezone text DEFAULT NULL,
  p_currency text DEFAULT NULL, p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_destination_config jsonb DEFAULT NULL)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.trips SET name = COALESCE(p_name, name), updated_by = v_uid,
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date), updated_at = now()
  WHERE id = p_trip_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.trips SET status = 'archived' WHERE status = 'active' AND id <> p_trip_id;
  UPDATE public.trips SET status = 'active' WHERE id = p_trip_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_activate_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_row public.trips;
BEGIN
  SELECT * INTO v_row FROM public.rpc_admin_set_active_trip(p_trip_id);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_archive_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips; v_status text;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status::text INTO v_status FROM public.trips WHERE id = p_trip_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF v_status = 'active' THEN RAISE EXCEPTION 'cannot_archive_active_trip'; END IF;
  UPDATE public.trips SET status='archived', updated_at=now()
   WHERE id = p_trip_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_add_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (p_trip_id, p_user_id, v_uid) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.trip_members WHERE trip_id = p_trip_id AND user_id = p_user_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.active_trip_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT id FROM public.trips WHERE status = 'active' LIMIT 1 $$;

-- Produksjonsform: anon har fortsatt EXECUTE (Port 0/0b skal fjerne det).
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_trip(text,text,text,text,text,date,date,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_trip(uuid,text,text,text,text,text,date,date,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_active_trip(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_activate_trip(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_archive_trip(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_add_trip_member(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_remove_trip_member(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.active_trip_id() TO anon, authenticated;

