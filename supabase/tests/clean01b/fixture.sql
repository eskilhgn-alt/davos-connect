-- Minimal Supabase-like fixture for CLEAN-01B (isolated native PostgreSQL only).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT string_to_array(name,'/') $$;
CREATE FUNCTION public.is_approved_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _uid IS NOT NULL $$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE storage.objects(id serial PRIMARY KEY, bucket_id text, name text);
GRANT ALL ON storage.objects TO authenticated, service_role; GRANT USAGE ON SEQUENCE storage.objects_id_seq TO authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved members can read private media" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])) AND public.is_approved_member(auth.uid()));
CREATE POLICY "Approved members upload own private media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])) AND public.is_approved_member(auth.uid()) AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners can delete private media" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])) AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));
CREATE POLICY "Owners can update private media" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])) AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())))
  WITH CHECK ((bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])) AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));
CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id='avatars');
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('chat-media','a0000000-0000-0000-0000-000000000001/x.jpg'),
 ('stories','a0000000-0000-0000-0000-000000000001/s.jpg'),
 ('round-receipts','a0000000-0000-0000-0000-000000000001/r.jpg');

-- The nine retired tables (simplified columns, same names).
CREATE TABLE public.rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id text, total_cost numeric, trip_id uuid);
CREATE TABLE public.round_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round_id uuid REFERENCES public.rounds, user_id text);
CREATE TABLE public.debt_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric);
CREATE TABLE public.polls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.poll_options(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poll_id uuid REFERENCES public.polls, label text);
CREATE TABLE public.poll_votes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), poll_id uuid, option_id uuid, user_id uuid);
CREATE TABLE public.faktasjekker_threads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text);
CREATE TABLE public.faktasjekker_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid REFERENCES public.faktasjekker_threads, content text);
CREATE TABLE public.faktasjekker_rate_limits(user_id uuid, window_type text, request_count int, PRIMARY KEY(user_id,window_type));
CREATE TABLE public.legacy_counter(id bigserial PRIMARY KEY); -- unrelated sequence, must be untouched
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "open_%s" ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "auth_%s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP; END $$;
INSERT INTO public.rounds(id,buyer_id,total_cost) SELECT gen_random_uuid(), 'u'||g, g FROM generate_series(1,11) g;
INSERT INTO public.round_participants(round_id,user_id) SELECT r.id, 'p'||g FROM public.rounds r, generate_series(1,7) g LIMIT 79;
INSERT INTO public.polls(question) VALUES ('Hvor?');
INSERT INTO public.poll_options(poll_id,label) SELECT id, l FROM public.polls, unnest(ARRAY['A','B']) l;
INSERT INTO public.faktasjekker_threads(user_id,title) SELECT gen_random_uuid(),'t'||g FROM generate_series(1,4) g;
INSERT INTO public.faktasjekker_messages(thread_id,content) SELECT id, 'm'||g FROM public.faktasjekker_threads, generate_series(1,7) g LIMIT 26;

CREATE FUNCTION public.update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER update_polls_updated_at BEFORE UPDATE ON public.polls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE FUNCTION public.create_round_with_participants(p_client_id uuid, p_drink_type text, p_total_cost numeric, p_participant_ids uuid[], p_note text, p_drink_quantities jsonb, p_receipt_path text, p_is_treated boolean, p_currency text, p_trip_id uuid)
 RETURNS public.rounds LANGUAGE sql SECURITY DEFINER AS $$ SELECT * FROM public.rounds LIMIT 1 $$;
CREATE FUNCTION public.create_poll_with_options(p_question text, p_options text[], p_require_all boolean, p_send_push_on_create boolean, p_send_push_on_resolved boolean, p_deadline_at timestamptz, p_min_votes integer, p_trip_id uuid)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT gen_random_uuid() $$;
CREATE FUNCTION public.start_faktasjekk(p_user_id uuid, p_thread_id uuid, p_claim text, p_request_id uuid)
 RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT p_thread_id $$;
CREATE FUNCTION public.consume_faktasjekker_quota(p_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
GRANT EXECUTE ON FUNCTION public.create_round_with_participants(uuid,text,numeric,uuid[],text,jsonb,text,boolean,text,uuid), public.create_poll_with_options(text,text[],boolean,boolean,boolean,timestamptz,integer,uuid), public.start_faktasjekk(uuid,uuid,text,uuid), public.consume_faktasjekker_quota(uuid) TO anon, authenticated, service_role;

-- Shot objects that must remain untouched.
CREATE TABLE public.shot_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
GRANT SELECT ON public.shot_events TO authenticated; GRANT ALL ON public.shot_events TO service_role;
ALTER TABLE public.shot_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY shot_read ON public.shot_events FOR SELECT TO authenticated USING (true);
CREATE FUNCTION public.rpc_start_shot_round(p_group_id text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE public.notification_dispatches(dedupe_key text PRIMARY KEY);
ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;

CREATE PUBLICATION supabase_realtime FOR TABLE public.polls, public.poll_votes, public.rounds, public.shot_events;
CREATE SCHEMA cron; CREATE TABLE cron.job(jobid serial, jobname text, command text);
INSERT INTO cron.job(jobname,command) VALUES ('weather','select 1');

CREATE TABLE public.c01b_snap(phase text, tbl text, n bigint, h text);
CREATE FUNCTION public.c01b_assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; RAISE NOTICE 'ok: %', msg; END $$;
CREATE FUNCTION public.c01b_fingerprint() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
    SELECT 'acl:'||c.relname||coalesce(c.relacl::text,'') x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('shot_events','notification_dispatches','legacy_counter','legacy_counter_id_seq')
    UNION ALL SELECT 'pol:'||tablename||policyname||cmd||roles::text||coalesce(qual,'') FROM pg_policies WHERE tablename IN ('shot_events','notification_dispatches')
    UNION ALL SELECT 'fn:'||p.oid::regprocedure::text||coalesce(p.proacl::text,'') FROM pg_proc p WHERE proname='rpc_start_shot_round'
    UNION ALL SELECT 'pub:'||tablename FROM pg_publication_tables WHERE tablename='shot_events') s $$;
CREATE TABLE public.c01b_fp(phase text, fp text);
