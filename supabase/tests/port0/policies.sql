-- Turfølsomme policyer som bygger på Port-0-hjelperne. Kjøres ETTER migrasjonen.
-- Produksjonsformede permissive policyer (Port 0 legger RESTRICTIVE på toppen).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agenda_events' AND policyname='agenda_select') THEN
    CREATE POLICY agenda_select ON public.agenda_events FOR SELECT TO authenticated
      USING (public.can_read_trip(trip_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agenda_events' AND policyname='agenda_insert') THEN
    CREATE POLICY agenda_insert ON public.agenda_events FOR INSERT TO authenticated
      WITH CHECK (public.can_read_trip(trip_id, auth.uid()) AND created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agenda_events' AND policyname='agenda_update') THEN
    CREATE POLICY agenda_update ON public.agenda_events FOR UPDATE TO authenticated
      USING (public.can_read_trip(trip_id, auth.uid())
             AND (created_by = auth.uid() OR public.is_trip_admin(trip_id, auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agenda_events' AND policyname='agenda_delete') THEN
    CREATE POLICY agenda_delete ON public.agenda_events FOR DELETE TO authenticated
      USING (public.can_read_trip(trip_id, auth.uid())
             AND (created_by = auth.uid() OR public.is_trip_admin(trip_id, auth.uid())));
  END IF;
END $$;

