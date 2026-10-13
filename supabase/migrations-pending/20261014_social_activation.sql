-- REVIEWABLE ACTIVATION CANDIDATE. Never included in automatic migrations.
-- Run only after SOCIAL_ACTIVATION.md gates. No secret values in this file.
BEGIN;
DO $$ BEGIN
 IF current_setting('guttahutte.social_tests_verified',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Complete documented native/integration gates before enabling jobs'; END IF;
 IF to_regprocedure('public.social_tick()') IS NULL THEN RAISE EXCEPTION 'Social schema absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron' AND string_to_array(extversion,'.')::int[] >= ARRAY[1,5]) THEN
  RAISE EXCEPTION 'pg_cron seconds scheduling support must be verified'; END IF;
 IF to_regclass('vault.decrypted_secrets') IS NULL THEN RAISE EXCEPTION 'Vault unavailable'; END IF;
 IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN ('social_worker_secret','social_function_url','social_publishable_key') AND length(decrypted_secret)>0)<>3 THEN
  RAISE EXCEPTION 'Configure three reviewed Vault entries first'; END IF;
 IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='social_function_url')<>'https://psupgftxzyoyeyuhtqgw.supabase.co/functions/v1/social' THEN
  RAISE EXCEPTION 'Wrong social project URL'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='shot-draw-sweep' AND active) THEN
  RAISE EXCEPTION 'Old Shot sweep requires explicit review/deactivation first'; END IF;
END $$;
SELECT cron.schedule('guttahutte-social-tick','1 second','SELECT public.social_tick()');
SELECT cron.schedule('guttahutte-social-delivery','10 seconds',$job$
 SELECT net.http_post(
  url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='social_function_url'),
  headers:=jsonb_build_object('Content-Type','application/json',
   'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='social_publishable_key'),
   'x-social-worker-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='social_worker_secret')),
  body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=85000)
$job$);
DO $$ DECLARE t text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN RAISE EXCEPTION 'Realtime publication absent'; END IF;
 FOREACH t IN ARRAY ARRAY['social_events','in_app_notifications','shot_draws','headshot_rights'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
  END IF;
 END LOOP;
END $$;
COMMIT;
