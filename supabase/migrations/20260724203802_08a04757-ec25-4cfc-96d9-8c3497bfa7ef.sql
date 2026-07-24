
-- ============================================================================
-- Multi-trip architecture: trips + trip_members, trip_id on core tables
-- ============================================================================

-- 1. Enum + tables ----------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.trip_status AS ENUM ('active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  destination text NOT NULL,
  country text,
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  currency text NOT NULL DEFAULT 'EUR',
  start_date date,
  end_date date,
  status public.trip_status NOT NULL DEFAULT 'archived',
  destination_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Approved members can read all trips; only admins can write via RPCs.
DROP POLICY IF EXISTS "Approved members can read trips" ON public.trips;
CREATE POLICY "Approved members can read trips" ON public.trips
  FOR SELECT TO authenticated
  USING (public.is_approved_member(auth.uid()));

DROP POLICY IF EXISTS "Admins manage trips" ON public.trips;
CREATE POLICY "Admins manage trips" ON public.trips
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Enforce max one active trip
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_uidx
  ON public.trips ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

GRANT SELECT ON public.trip_members TO authenticated;
GRANT ALL ON public.trip_members TO service_role;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own memberships" ON public.trip_members;
CREATE POLICY "Members read own memberships" ON public.trip_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins manage trip_members" ON public.trip_members;
CREATE POLICY "Admins manage trip_members" ON public.trip_members
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS trip_members_user_idx ON public.trip_members(user_id);

-- 2. Helper functions -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_trip_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.trips WHERE status = 'active' LIMIT 1 $$;

REVOKE ALL ON FUNCTION public.active_trip_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_trip_id() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
     WHERE trip_id = _trip_id AND user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_trip_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid, uuid) TO authenticated;

-- 3. Seed Val Thorens 2027 active trip -------------------------------------
DO $$
DECLARE
  v_trip uuid;
BEGIN
  SELECT id INTO v_trip FROM public.trips WHERE status = 'active' LIMIT 1;
  IF v_trip IS NULL THEN
    INSERT INTO public.trips (id, name, destination, country, timezone, currency,
                              status, destination_config)
    VALUES (
      gen_random_uuid(),
      'Val Thorens 2027',
      'Val Thorens',
      'France',
      'Europe/Paris',
      'EUR',
      'active',
      jsonb_build_object(
        'center', jsonb_build_object('lat', 45.2977, 'lon', 6.5804),
        'weatherUrl', 'https://meteofrance.com/meteo-montagne/val-thorens/732573',
        'webcamsUrl', 'https://www.valthorens.com/en/webcams/',
        'trailMapUrl', 'https://www.valthorens.com/en/ski/plan/',
        'avalancheUrl', 'https://www.valthorens.com/en/ski/securite-secours/'
      )
    ) RETURNING id INTO v_trip;
  END IF;

  -- All currently approved + active members become members of the active trip.
  INSERT INTO public.trip_members (trip_id, user_id)
  SELECT v_trip, p.id
    FROM public.profiles p
   WHERE p.is_active AND NOT p.is_banned AND p.membership_status = 'approved'
  ON CONFLICT DO NOTHING;
END $$;

-- 4. Add trip_id to core tables --------------------------------------------
DO $$
DECLARE
  v_trip uuid;
  v_tbl text;
  v_tables text[] := ARRAY[
    'messages','stories','gallery_items','agenda_events','polls','rounds'
  ];
BEGIN
  SELECT id INTO v_trip FROM public.trips WHERE status = 'active' LIMIT 1;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE RESTRICT',
      v_tbl
    );
    EXECUTE format('UPDATE public.%I SET trip_id = $1 WHERE trip_id IS NULL', v_tbl)
      USING v_trip;
    -- Backwards-compatible default: new inserts fall through to the active trip.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN trip_id SET DEFAULT public.active_trip_id()',
      v_tbl
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN trip_id SET NOT NULL', v_tbl
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (trip_id)',
      v_tbl || '_trip_id_idx', v_tbl
    );
  END LOOP;
END $$;

-- 5. Trip-scoped RLS supplement --------------------------------------------
-- Add a policy that also requires membership in the row's trip. Existing
-- is_approved_member() policies keep pending/banned out; these add trip scope.
DO $$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'messages','stories','gallery_items','agenda_events','polls','rounds'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Trip scope: members only" ON public.%I', v_tbl
    );
    EXECUTE format($f$
      CREATE POLICY "Trip scope: members only" ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR public.is_trip_member(trip_id, auth.uid())
        )
        WITH CHECK (
          public.is_admin(auth.uid())
          OR (
            public.is_trip_member(trip_id, auth.uid())
            AND EXISTS (
              SELECT 1 FROM public.trips t
               WHERE t.id = trip_id AND t.status = 'active'
            )
          )
        )
    $f$, v_tbl);
  END LOOP;
END $$;

-- 6. user_locations: admin-only --------------------------------------------
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_locations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname='public' AND tablename='user_locations'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_locations', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admin-only user_locations" ON public.user_locations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 7. Admin RPCs -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_create_trip(
  p_name text,
  p_destination text,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'Europe/Paris',
  p_currency text DEFAULT 'EUR',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT '{}'::jsonb
) RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_created', jsonb_build_object('trip_id', v_row.id, 'name', p_name));
  RETURN v_row;
END $$;

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
) RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
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
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_updated', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_active_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  -- Atomic swap: archive current active, then activate target.
  UPDATE public.trips SET status = 'archived', updated_by = v_uid, updated_at = now()
    WHERE status = 'active' AND id <> p_trip_id;
  UPDATE public.trips SET status = 'active', updated_by = v_uid, updated_at = now()
    WHERE id = p_trip_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_activated', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_archive_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.trips SET status='archived', updated_by=v_uid, updated_at=now()
    WHERE id = p_trip_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_archived', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_add_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (p_trip_id, p_user_id, v_uid)
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  DELETE FROM public.trip_members WHERE trip_id = p_trip_id AND user_id = p_user_id;
  RETURN true;
END $$;

-- Auto-add newly approved members to the active trip.
CREATE OR REPLACE FUNCTION public.trg_add_approved_to_active_trip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_trip uuid;
BEGIN
  IF NEW.membership_status = 'approved' AND NEW.is_active AND NOT NEW.is_banned THEN
    SELECT id INTO v_trip FROM public.trips WHERE status='active' LIMIT 1;
    IF v_trip IS NOT NULL THEN
      INSERT INTO public.trip_members (trip_id, user_id)
      VALUES (v_trip, NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_add_to_active_trip ON public.profiles;
CREATE TRIGGER trg_profiles_add_to_active_trip
  AFTER INSERT OR UPDATE OF membership_status, is_active, is_banned
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_add_approved_to_active_trip();

REVOKE ALL ON FUNCTION public.rpc_admin_create_trip(text,text,text,text,text,date,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_trip(text,text,text,text,text,date,date,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_update_trip(uuid,text,text,text,text,text,date,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_trip(uuid,text,text,text,text,text,date,date,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_set_active_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_active_trip(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_archive_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_archive_trip(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_add_trip_member(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_add_trip_member(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_remove_trip_member(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_remove_trip_member(uuid,uuid) TO authenticated;
