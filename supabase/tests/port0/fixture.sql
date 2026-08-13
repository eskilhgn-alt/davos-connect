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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT SELECT ON public.trips, public.trip_members, public.profiles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

-- Minimal admin-RPC som Port 0 skal låse ned grants på (validerer admin internt).
CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_row public.trips;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.trips SET status = 'archived' WHERE status = 'active' AND id <> p_trip_id;
  UPDATE public.trips SET status = 'active' WHERE id = p_trip_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.active_trip_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT id FROM public.trips WHERE status = 'active' LIMIT 1 $$;
