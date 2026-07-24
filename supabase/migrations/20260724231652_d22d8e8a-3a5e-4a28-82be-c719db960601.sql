
-- =====================================================================
-- MÅL 1: Lukk resterende DB-lekkasjer. Strategi: legg til RESTRICTIVE
-- overlays som krever trip-membership via forelder, og skjerp trips SELECT.
-- =====================================================================

-- 1. TRIPS: kun turer man er medlem av
DROP POLICY IF EXISTS "Approved members can read trips" ON public.trips;
CREATE POLICY "Members can read own trips" ON public.trips
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_trip_member(id, auth.uid()));

-- 2. Hjelpefunksjon: godkjent medlem av forelderens tur?
CREATE OR REPLACE FUNCTION public.is_approved_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _trip_id IS NOT NULL
     AND public.is_approved_member(_user_id)
     AND public.is_trip_member(_trip_id, _user_id)
$$;
REVOKE ALL ON FUNCTION public.is_approved_trip_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_trip_member(uuid, uuid) TO authenticated;

-- 3. Generic child-table trip scope: RESTRICTIVE overlay via parent lookup.
--    Existing PERMISSIVE ownership/approved-member policies remain in effect
--    for base allow logic; these overlays subtract non-members and archive-writes.

-- chat_reads / message_reactions → messages
DO $$
DECLARE t text; parent_col text := 'message_id'; parent_table text := 'messages';
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_reads','message_reactions'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS trip_scope_read_%1$s  ON public.%1$I;
      DROP POLICY IF EXISTS trip_scope_write_%1$s ON public.%1$I;
      CREATE POLICY trip_scope_read_%1$s ON public.%1$I
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.%2$I p
            WHERE p.id = %1$I.%3$I
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
          )
        );
      CREATE POLICY trip_scope_write_%1$s ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.%2$I p
            WHERE p.id = %1$I.%3$I
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
              AND public.is_trip_active(p.trip_id)
          )
        );
    $f$, t, parent_table, parent_col);
  END LOOP;
END $$;

-- story_views / story_likes → stories
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['story_views','story_likes'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS trip_scope_read_%1$s  ON public.%1$I;
      DROP POLICY IF EXISTS trip_scope_write_%1$s ON public.%1$I;
      CREATE POLICY trip_scope_read_%1$s ON public.%1$I
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.stories p
            WHERE p.id = %1$I.story_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
          )
        );
      CREATE POLICY trip_scope_write_%1$s ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.stories p
            WHERE p.id = %1$I.story_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
              AND public.is_trip_active(p.trip_id)
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- gallery_comments / gallery_likes → gallery_items (child fk = item_id)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gallery_comments','gallery_likes'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS trip_scope_read_%1$s  ON public.%1$I;
      DROP POLICY IF EXISTS trip_scope_write_%1$s ON public.%1$I;
      CREATE POLICY trip_scope_read_%1$s ON public.%1$I
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.gallery_items p
            WHERE p.id = %1$I.item_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
          )
        );
      CREATE POLICY trip_scope_write_%1$s ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.gallery_items p
            WHERE p.id = %1$I.item_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
              AND public.is_trip_active(p.trip_id)
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- poll_options / poll_votes → polls (poll_votes already has archive-write block, add trip-scope read)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poll_options','poll_votes'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS trip_scope_read_%1$s  ON public.%1$I;
      DROP POLICY IF EXISTS trip_scope_write_%1$s ON public.%1$I;
      CREATE POLICY trip_scope_read_%1$s ON public.%1$I
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.polls p
            WHERE p.id = %1$I.poll_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
          )
        );
      CREATE POLICY trip_scope_write_%1$s ON public.%1$I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.polls p
            WHERE p.id = %1$I.poll_id
              AND public.is_approved_trip_member(p.trip_id, auth.uid())
              AND public.is_trip_active(p.trip_id)
          )
        );
    $f$, t);
  END LOOP;
END $$;

-- round_participants → rounds
DROP POLICY IF EXISTS trip_scope_read_round_participants  ON public.round_participants;
DROP POLICY IF EXISTS trip_scope_write_round_participants ON public.round_participants;
CREATE POLICY trip_scope_read_round_participants ON public.round_participants
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.rounds p
      WHERE p.id = round_participants.round_id
        AND public.is_approved_trip_member(p.trip_id, auth.uid())
    )
  );
CREATE POLICY trip_scope_write_round_participants ON public.round_participants
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.rounds p
      WHERE p.id = round_participants.round_id
        AND public.is_approved_trip_member(p.trip_id, auth.uid())
        AND public.is_trip_active(p.trip_id)
    )
  );

-- 4. debt_settlements: legg til nullable trip_id + FK + indeks. Backfill IKKE.
ALTER TABLE public.debt_settlements
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS debt_settlements_trip_idx ON public.debt_settlements(trip_id);

-- Ny RESTRICTIVE overlay: hvis trip_id er satt, må bruker være godkjent medlem;
-- writes til satt trip krever aktiv tur. Legacy-rader (trip_id IS NULL) beholder
-- eksisterende approved-member-tilgang.
DROP POLICY IF EXISTS trip_scope_read_debt_settlements  ON public.debt_settlements;
DROP POLICY IF EXISTS trip_scope_write_debt_settlements ON public.debt_settlements;
CREATE POLICY trip_scope_read_debt_settlements ON public.debt_settlements
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR trip_id IS NULL
    OR public.is_approved_trip_member(trip_id, auth.uid())
  );
CREATE POLICY trip_scope_write_debt_settlements ON public.debt_settlements
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR trip_id IS NULL
    OR (
      public.is_approved_trip_member(trip_id, auth.uid())
      AND public.is_trip_active(trip_id)
    )
  );
