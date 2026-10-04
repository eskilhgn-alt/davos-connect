-- CLEAN-01B: retire Runder/Utlegg, Avstemninger and Faktasjekk on the backend.
-- Idempotent and non-destructive: no DROP TABLE / TRUNCATE / DELETE / UPDATE of rows.
-- Historical rows stay readable for postgres/service_role only. Shot and
-- notification_dispatches are intentionally untouched.

DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY['rounds','round_participants','debt_settlements','polls','poll_options',
                         'poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;

  -- Owned sequences of the nine tables (none expected; uuid keys) - revoke defensively.
  FOR pol IN
    SELECT s.oid::regclass::text AS seq FROM pg_class s
    JOIN pg_depend d ON d.objid=s.oid AND d.deptype IN ('a','i')
    JOIN pg_class c ON c.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE s.relkind='S' AND n.nspname='public' AND c.relname = ANY(tables)
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', pol.seq);
  END LOOP;

  -- Realtime membership, only if present.
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['polls','poll_votes','rounds'] LOOP
      IF EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_polls_updated_at ON public.polls;

-- Retired SECURITY DEFINER RPCs: no client EXECUTE; keep postgres/service_role.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_round_with_participants(uuid,text,numeric,uuid[],text,jsonb,text,boolean,text,uuid)',
    'public.create_poll_with_options(text,text[],boolean,boolean,boolean,timestamp with time zone,integer,uuid)',
    'public.start_faktasjekk(uuid,uuid,text,uuid)',
    'public.consume_faktasjekker_quota(uuid)']
  LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

-- Storage: same four policies, chat-media + stories unchanged, round-receipts removed.
-- Bucket and objects are preserved.
DROP POLICY IF EXISTS "Approved members can read private media" ON storage.objects;
CREATE POLICY "Approved members can read private media" ON storage.objects
  FOR SELECT TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media'::text, 'stories'::text])) AND public.is_approved_member(auth.uid()));

DROP POLICY IF EXISTS "Approved members upload own private media" ON storage.objects;
CREATE POLICY "Approved members upload own private media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = ANY (ARRAY['chat-media'::text, 'stories'::text])) AND public.is_approved_member(auth.uid())
              AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS "Owners can delete private media" ON storage.objects;
CREATE POLICY "Owners can delete private media" ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media'::text, 'stories'::text]))
         AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Owners can update private media" ON storage.objects;
CREATE POLICY "Owners can update private media" ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media'::text, 'stories'::text]))
         AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_admin(auth.uid())))
  WITH CHECK ((bucket_id = ANY (ARRAY['chat-media'::text, 'stories'::text]))
              AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.is_admin(auth.uid())));
