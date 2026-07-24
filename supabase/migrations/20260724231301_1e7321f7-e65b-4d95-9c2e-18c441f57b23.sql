
-- 1) Fix critical read regression: RESTRICTIVE FOR ALL policies with
--    is_trip_active() were blocking SELECT on archived rows. Replace with
--    write-only restrictive policies so archives remain readable but immutable.

DROP POLICY IF EXISTS archive_write_block_agenda    ON public.agenda_events;
DROP POLICY IF EXISTS archive_write_block_gallery   ON public.gallery_items;
DROP POLICY IF EXISTS archive_write_block_messages  ON public.messages;
DROP POLICY IF EXISTS archive_write_block_polls     ON public.polls;
DROP POLICY IF EXISTS archive_write_block_rounds    ON public.rounds;
DROP POLICY IF EXISTS archive_write_block_stories   ON public.stories;
DROP POLICY IF EXISTS archive_write_block_poll_votes ON public.poll_votes;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['agenda_events','gallery_items','messages','polls','rounds','stories'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY archive_block_insert_%1$s ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));
      CREATE POLICY archive_block_update_%1$s ON public.%1$I
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (trip_id IS NULL OR public.is_trip_active(trip_id))
        WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));
      CREATE POLICY archive_block_delete_%1$s ON public.%1$I
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (trip_id IS NULL OR public.is_trip_active(trip_id));
    $f$, t);
  END LOOP;
END $$;

-- poll_votes has no trip_id column: gate via parent poll
CREATE POLICY archive_block_insert_poll_votes ON public.poll_votes
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id
      AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
  ));
CREATE POLICY archive_block_update_poll_votes ON public.poll_votes
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id
      AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id
      AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
  ));
CREATE POLICY archive_block_delete_poll_votes ON public.poll_votes
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id
      AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
  ));

-- 2) Auto-add creator to trip_members on create
CREATE OR REPLACE FUNCTION public.rpc_admin_create_trip(
  p_name text, p_destination text, p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'Europe/Paris', p_currency text DEFAULT 'EUR',
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT '{}'::jsonb
) RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  VALUES (v_row.id, v_uid, v_uid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_created', jsonb_build_object('trip_id', v_row.id, 'name', p_name));
  RETURN v_row;
END $$;

-- 3) Block direct archive of the active trip
CREATE OR REPLACE FUNCTION public.rpc_admin_archive_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips; v_current_status text;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT status::text INTO v_current_status FROM public.trips WHERE id = p_trip_id;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF v_current_status = 'active' THEN
    RAISE EXCEPTION 'cannot_archive_active_trip'
      USING HINT = 'Aktiver en annen tur i stedet — det arkiverer denne automatisk.';
  END IF;
  UPDATE public.trips SET status='archived', updated_by=v_uid, updated_at=now()
    WHERE id = p_trip_id RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_archived', jsonb_build_object('trip_id', p_trip_id));
  RETURN v_row;
END $$;

-- 4) Block removing the last member of the active trip
CREATE OR REPLACE FUNCTION public.rpc_admin_remove_trip_member(p_trip_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_is_active boolean; v_remaining int;
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'not_admin'; END IF;
  SELECT (status = 'active') INTO v_is_active FROM public.trips WHERE id = p_trip_id;
  IF v_is_active IS NULL THEN RAISE EXCEPTION 'trip_not_found'; END IF;
  IF v_is_active THEN
    SELECT count(*) INTO v_remaining FROM public.trip_members
     WHERE trip_id = p_trip_id AND user_id <> p_user_id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_member_of_active_trip';
    END IF;
  END IF;
  DELETE FROM public.trip_members WHERE trip_id = p_trip_id AND user_id = p_user_id;
  RETURN true;
END $$;

-- 5) Convenience alias used by newer clients
CREATE OR REPLACE FUNCTION public.rpc_admin_activate_trip(p_trip_id uuid)
RETURNS public.trips
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.rpc_admin_set_active_trip(p_trip_id)
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_activate_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_activate_trip(uuid) TO authenticated;
