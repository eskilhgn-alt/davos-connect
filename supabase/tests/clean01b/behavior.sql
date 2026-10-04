\set ON_ERROR_STOP 1
SELECT public.c01b_assert(NOT EXISTS (
  SELECT 1 FROM public.c01b_snap a JOIN public.c01b_snap b ON a.tbl=b.tbl AND a.phase='pre' AND b.phase='post'
  WHERE a.n<>b.n OR a.h<>b.h) AND (SELECT count(*) FROM public.c01b_snap WHERE phase='post')=9,
  'row counts and content hashes identical for all nine tables');
SELECT public.c01b_assert((SELECT n FROM public.c01b_snap WHERE phase='post' AND tbl='rounds')=11
  AND (SELECT n FROM public.c01b_snap WHERE phase='post' AND tbl='round_participants')=79
  AND (SELECT n FROM public.c01b_snap WHERE phase='post' AND tbl='faktasjekker_messages')=26, 'fixture counts mirror production');
SELECT public.c01b_assert((SELECT count(DISTINCT fp)=1 FROM public.c01b_fp), 'Shot/notification_dispatches/unrelated objects unchanged');

SELECT public.c01b_assert(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY['rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits']) t,
       unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  WHERE has_table_privilege(r, 'public.'||t, p)), 'anon/authenticated have no table privileges');
SELECT public.c01b_assert(NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a
  WHERE c.relname IN ('rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits')
  AND a.grantee=0), 'PUBLIC has no table privileges');
SELECT public.c01b_assert(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits')), 'no RLS policies remain');
SELECT public.c01b_assert((SELECT bool_and(relrowsecurity) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
  ('rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits')), 'RLS still enabled');
SELECT public.c01b_assert(NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename IN ('polls','poll_votes','rounds')), 'Realtime membership removed');
SELECT public.c01b_assert(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_polls_updated_at'), 'poll trigger removed');
SELECT public.c01b_assert(NOT EXISTS (SELECT 1 FROM cron.job WHERE command ~* '(round|poll|faktasjekk)'), 'no related cron jobs');
SELECT public.c01b_assert(NOT EXISTS (
  SELECT 1 FROM unnest(ARRAY['public.create_round_with_participants(uuid,text,numeric,uuid[],text,jsonb,text,boolean,text,uuid)',
    'public.create_poll_with_options(text,text[],boolean,boolean,boolean,timestamp with time zone,integer,uuid)',
    'public.start_faktasjekk(uuid,uuid,text,uuid)','public.consume_faktasjekker_quota(uuid)']) f, unnest(ARRAY['anon','authenticated','public']) r
  WHERE has_function_privilege(r, f, 'EXECUTE')), 'retired RPCs not executable by PUBLIC/anon/authenticated');
SELECT public.c01b_assert(has_function_privilege('service_role','public.consume_faktasjekker_quota(uuid)','EXECUTE'), 'service_role keeps RPC EXECUTE');

-- Runtime denial as each client role.
DO $$ DECLARE r text; stmt text; ok int := 0; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH stmt IN ARRAY ARRAY['SELECT 1 FROM public.rounds','INSERT INTO public.polls(question) VALUES (''x'')',
      'UPDATE public.faktasjekker_threads SET title=''x''','DELETE FROM public.round_participants',
      'SELECT public.consume_faktasjekker_quota(gen_random_uuid())','SELECT public.start_faktasjekk(NULL,NULL,NULL,NULL)',
      'SELECT public.create_poll_with_options(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)',
      'SELECT public.create_round_with_participants(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', r); EXECUTE stmt; RESET ROLE;
        RAISE EXCEPTION 'FAIL: % allowed: %', r, stmt;
      EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; ok := ok + 1; END;
    END LOOP;
  END LOOP;
  PERFORM public.c01b_assert(ok = 16, 'anon/authenticated CRUD and RPC calls denied at runtime (16/16)');
END $$;

SET ROLE service_role;
SELECT public.c01b_assert((SELECT count(*) FROM public.rounds)=11 AND (SELECT count(*) FROM public.faktasjekker_messages)=26, 'service_role reads history');
RESET ROLE;
SELECT public.c01b_assert((SELECT count(*) FROM public.polls)=1, 'postgres reads history');

-- Storage behavior as an approved authenticated user.
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.c01b_assert((SELECT count(*) FROM storage.objects WHERE bucket_id IN ('chat-media','stories'))=2, 'chat-media/stories readable');
SELECT public.c01b_assert((SELECT count(*) FROM storage.objects WHERE bucket_id='round-receipts')=0, 'round-receipts unreadable');
INSERT INTO storage.objects(bucket_id,name) VALUES ('chat-media','a0000000-0000-0000-0000-000000000001/new.jpg');
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('round-receipts','a0000000-0000-0000-0000-000000000001/new.jpg');
  RAISE EXCEPTION 'FAIL: round-receipts upload allowed';
EXCEPTION WHEN insufficient_privilege THEN PERFORM public.c01b_assert(true,'round-receipts upload denied'); END $$;
WITH u AS (UPDATE storage.objects SET name=name WHERE bucket_id='round-receipts' RETURNING 1) SELECT public.c01b_assert((SELECT count(*) FROM u)=0,'round-receipts update no-op');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id='round-receipts' RETURNING 1) SELECT public.c01b_assert((SELECT count(*) FROM d)=0,'round-receipts delete no-op');
WITH d AS (DELETE FROM storage.objects WHERE bucket_id='chat-media' AND name LIKE '%new.jpg' RETURNING 1) SELECT public.c01b_assert((SELECT count(*) FROM d)=1,'chat-media own delete still allowed');
RESET ROLE;
SELECT public.c01b_assert((SELECT count(*) FROM storage.objects WHERE bucket_id='round-receipts')=1, 'round-receipts object preserved');
SELECT public.c01b_assert((SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND policyname IN ('Approved members can read private media','Approved members upload own private media','Owners can delete private media','Owners can update private media')
  AND coalesce(qual,'')||coalesce(with_check,'') NOT LIKE '%round-receipts%' AND coalesce(qual,'')||coalesce(with_check,'') LIKE '%chat-media%stories%')=4, 'four storage policies keep chat-media+stories only');
SELECT 'CLEAN-01B NATIVE SQL PASSED' AS result;
