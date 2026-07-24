
-- Helper: er turen aktiv?
CREATE OR REPLACE FUNCTION public.is_trip_active(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips WHERE id = _trip_id AND status = 'active'
  )
$$;

-- Restrictive policies — hver skrivehandling må dessuten oppfylle "trip is active".
-- Restrictive kombineres AND med eksisterende permissive policies, så eksisterende
-- lese-/eierskapstilgang endres ikke.

-- messages
DROP POLICY IF EXISTS "archive_write_block_messages" ON public.messages;
CREATE POLICY "archive_write_block_messages" ON public.messages
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));

-- stories
DROP POLICY IF EXISTS "archive_write_block_stories" ON public.stories;
CREATE POLICY "archive_write_block_stories" ON public.stories
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));

-- gallery_items
DROP POLICY IF EXISTS "archive_write_block_gallery" ON public.gallery_items;
CREATE POLICY "archive_write_block_gallery" ON public.gallery_items
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));

-- agenda_events
DROP POLICY IF EXISTS "archive_write_block_agenda" ON public.agenda_events;
CREATE POLICY "archive_write_block_agenda" ON public.agenda_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));

-- polls
DROP POLICY IF EXISTS "archive_write_block_polls" ON public.polls;
CREATE POLICY "archive_write_block_polls" ON public.polls
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));

-- poll_votes — utled trip via poll
DROP POLICY IF EXISTS "archive_write_block_poll_votes" ON public.poll_votes;
CREATE POLICY "archive_write_block_poll_votes" ON public.poll_votes
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
        AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
        AND (p.trip_id IS NULL OR public.is_trip_active(p.trip_id))
    )
  );

-- rounds
DROP POLICY IF EXISTS "archive_write_block_rounds" ON public.rounds;
CREATE POLICY "archive_write_block_rounds" ON public.rounds
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (trip_id IS NULL OR public.is_trip_active(trip_id))
  WITH CHECK (trip_id IS NULL OR public.is_trip_active(trip_id));
