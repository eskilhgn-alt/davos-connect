-- PREPARED ONLY. Replaces the unapplied August Shot proposals for a fresh social schema.
-- Does not schedule jobs, deploy Edge, publish UI or change historic/chat dispatch rows.
-- Execute transactionally only after SOCIAL_ACTIVATION.md gates have passed.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.shot_draws') IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='shot_draws' AND column_name='kind') THEN
 RAISE EXCEPTION 'Existing Shot schema requires an explicit compatibility review; do not apply both pending proposals'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS social_private;
REVOKE ALL ON SCHEMA social_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA social_private TO service_role;

CREATE TABLE IF NOT EXISTS public.social_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips,
 kind text NOT NULL CHECK(kind IN ('vibe','shot_start','shot_result','shot_response','headshot_grant','headshot_result')),
 actor_id uuid, target_id uuid, source_id uuid, title text NOT NULL, body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ended_at timestamptz,
 UNIQUE(kind,source_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_one_active_vibe ON public.social_events(trip_id,actor_id)
 WHERE kind='vibe' AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS social_events_trip ON public.social_events(trip_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.social_events,
 trip_id uuid NOT NULL REFERENCES public.trips, recipient_id uuid NOT NULL,
 read_at timestamptz, dismissed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(event_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS in_app_recipient ON public.in_app_notifications(recipient_id,trip_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES public.social_events,
 trip_id uuid NOT NULL REFERENCES public.trips, recipient_id uuid NOT NULL,
 provider_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','accepted','failed','suppressed','expired')),
 attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid, lease_until timestamptz, provider_message_id text, last_error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), accepted_at timestamptz,
 UNIQUE(event_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS social_outbox_due ON public.notification_outbox(available_at)
 WHERE status IN ('pending','leased');
CREATE TABLE IF NOT EXISTS public.shot_draws (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips,
 initiated_by uuid NOT NULL, kind text NOT NULL DEFAULT 'draw' CHECK(kind IN ('draw','headshot')),
 idempotency_key text NOT NULL, status text NOT NULL CHECK(status IN ('countdown','finalized')),
 server_started_at timestamptz NOT NULL DEFAULT clock_timestamp(), draw_at timestamptz NOT NULL,
 finalized_at timestamptz, local_day date NOT NULL, timezone text NOT NULL,
 participant_count int NOT NULL CHECK(participant_count>0), participant_hash text NOT NULL,
 seed_commitment text NOT NULL, seed_reveal text, winner_id uuid, proof_counter int, proof_value bigint,
 algorithm_version text NOT NULL DEFAULT 'sha256-rejection-v1',
 response text CHECK(response IN ('taken','declined')), responded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(trip_id,initiated_by,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_one_countdown ON public.shot_draws(trip_id) WHERE status='countdown';
CREATE INDEX IF NOT EXISTS social_draws_day ON public.shot_draws(trip_id,local_day,initiated_by);
CREATE TABLE IF NOT EXISTS public.shot_draw_participants (
 draw_id uuid NOT NULL REFERENCES public.shot_draws, trip_id uuid NOT NULL REFERENCES public.trips,
 user_id uuid NOT NULL, position int NOT NULL CHECK(position>=0),
 PRIMARY KEY(draw_id,user_id), UNIQUE(draw_id,position)
);
CREATE TABLE IF NOT EXISTS social_private.draw_secrets (draw_id uuid PRIMARY KEY REFERENCES public.shot_draws, seed text NOT NULL);
CREATE TABLE IF NOT EXISTS public.headshot_rights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips,
 user_id uuid NOT NULL, local_day date NOT NULL, timezone text NOT NULL, expires_at timestamptz NOT NULL,
 reason text NOT NULL CHECK(reason IN ('leader','random')), consumed_by uuid REFERENCES public.shot_draws,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(trip_id,local_day,user_id)
);
CREATE TABLE IF NOT EXISTS social_private.allocations (
 trip_id uuid NOT NULL, local_day date NOT NULL, timezone text NOT NULL,
 eligible uuid[] NOT NULL, leader_pool uuid[] NOT NULL, chosen uuid[] NOT NULL,
 PRIMARY KEY(trip_id,local_day)
);
CREATE TABLE IF NOT EXISTS social_private.commands (
 trip_id uuid NOT NULL, actor_id uuid NOT NULL, key uuid NOT NULL, request_hash text NOT NULL,
 result jsonb NOT NULL, PRIMARY KEY(trip_id,actor_id,key)
);

-- No client table writes or private reads. Explicit policies for the public read model.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['social_events','in_app_notifications','notification_outbox','shot_draws','shot_draw_participants','headshot_rights'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  IF t<>'notification_outbox' THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='social_read') THEN
    EXECUTE format('CREATE POLICY social_read ON public.%I FOR SELECT TO authenticated USING (public.is_approved_trip_member(trip_id,auth.uid()) %s)',t,
     CASE t WHEN 'in_app_notifications' THEN 'AND recipient_id=auth.uid()' WHEN 'headshot_rights' THEN 'AND user_id=auth.uid()' ELSE '' END);
   END IF;
  END IF;
 END LOOP;
END $$;
ALTER TABLE social_private.draw_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_private.commands ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA social_private TO service_role;

CREATE OR REPLACE FUNCTION social_private.hash(p text) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT encode(sha256(convert_to(p,'UTF8')),'hex') $$;
CREATE OR REPLACE FUNCTION social_private.eligible(p_trip uuid) RETURNS uuid[]
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(array_agg(m.user_id ORDER BY m.user_id),ARRAY[]::uuid[]) FROM public.trip_members m
 WHERE m.trip_id=p_trip AND public.is_approved_trip_member(p_trip,m.user_id) $$;
CREATE OR REPLACE FUNCTION social_private.name(p_user uuid) RETURNS text
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(nullif(p.nickname,''),nullif(p.full_name,''),'Et medlem') FROM public.profiles p WHERE p.id=p_user $$;
CREATE OR REPLACE FUNCTION social_private.pick(seed text, draw uuid, n int)
 RETURNS TABLE(picked_position int,counter int,value bigint) LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
 DECLARE b bytea; lim bigint; BEGIN
 IF n IS NULL OR n<1 THEN RAISE EXCEPTION 'invalid_count'; END IF;
 lim:=(4294967296::bigint/n)*n;
 FOR i IN 0..10000 LOOP
  b:=sha256(convert_to(seed||':'||draw::text||':'||i::text,'UTF8'));
  value:=(get_byte(b,0)::bigint<<24)|(get_byte(b,1)::bigint<<16)|(get_byte(b,2)::bigint<<8)|get_byte(b,3)::bigint;
  IF value<lim THEN picked_position:=(value%n)::int; counter:=i; RETURN NEXT; RETURN; END IF;
 END LOOP; RAISE EXCEPTION 'sampling_exhausted'; END $$;

CREATE OR REPLACE FUNCTION social_private.emit(p_trip uuid,p_kind text,p_actor uuid,p_target uuid,p_source uuid,p_title text,p_body text,p_recipients uuid[])
 RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$ DECLARE e uuid; BEGIN
 INSERT INTO public.social_events(trip_id,kind,actor_id,target_id,source_id,title,body)
 VALUES(p_trip,p_kind,p_actor,p_target,p_source,p_title,p_body)
 ON CONFLICT(kind,source_id) DO NOTHING RETURNING id INTO e;
 IF e IS NULL THEN SELECT id INTO e FROM public.social_events WHERE kind=p_kind AND source_id=p_source; RETURN e; END IF;
 INSERT INTO public.in_app_notifications(event_id,trip_id,recipient_id)
 SELECT e,p_trip,u FROM unnest(p_recipients) u ON CONFLICT DO NOTHING;
 INSERT INTO public.notification_outbox(event_id,trip_id,recipient_id)
 SELECT e,p_trip,u FROM unnest(p_recipients) u ON CONFLICT DO NOTHING;
 RETURN e; END $$;

-- Commit/reveal is immutable to clients; only this locked path can finalize.
CREATE OR REPLACE FUNCTION social_private.finalize(p_trip uuid,p_now timestamptz)
 RETURNS int LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE d public.shot_draws; seed text; pick record; win uuid; ids uuid[]; n int:=0; BEGIN
 FOR d IN SELECT * FROM public.shot_draws WHERE trip_id=p_trip AND status='countdown' AND draw_at<=p_now FOR UPDATE LOOP
  SELECT s.seed INTO seed FROM social_private.draw_secrets s WHERE draw_id=d.id;
  SELECT * INTO pick FROM social_private.pick(seed,d.id,d.participant_count);
  SELECT user_id INTO STRICT win FROM public.shot_draw_participants WHERE draw_id=d.id AND position=pick.picked_position;
  UPDATE public.shot_draws SET status='finalized',finalized_at=p_now,winner_id=win,seed_reveal=seed,
   proof_counter=pick.counter,proof_value=pick.value WHERE id=d.id;
  SELECT array_agg(user_id ORDER BY position) INTO ids FROM public.shot_draw_participants WHERE draw_id=d.id;
  PERFORM social_private.emit(p_trip,'shot_result',d.initiated_by,win,d.id,'Shot your shot',social_private.name(win)||' fikk shot. Helt frivillig.',ids);
  n:=n+1;
 END LOOP; RETURN n; END $$;

CREATE OR REPLACE FUNCTION social_private.allocate(p_trip uuid,p_now timestamptz)
 RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE tz text; day date; ids uuid[]; leaders uuid[]; chosen uuid[]:=ARRAY[]::uuid[]; pool uuid[];
 who uuid; reason text; pos int; r uuid; BEGIN
 SELECT timezone INTO STRICT tz FROM public.trips WHERE id=p_trip AND status='active' FOR UPDATE;
 day:=(p_now AT TIME ZONE tz)::date;
 IF EXISTS(SELECT 1 FROM social_private.allocations WHERE trip_id=p_trip AND local_day=day) THEN RETURN; END IF;
 ids:=social_private.eligible(p_trip);
 WITH c AS (SELECT winner_id,count(*) n FROM public.shot_draws
  WHERE trip_id=p_trip AND status='finalized' AND winner_id=ANY(ids)
  AND (draw_at AT TIME ZONE tz)::date=day-1 GROUP BY winner_id)
 SELECT coalesce(array_agg(winner_id ORDER BY winner_id),ARRAY[]::uuid[]) INTO leaders FROM c WHERE n=(SELECT max(n) FROM c);
 IF cardinality(leaders)>0 THEN
  SELECT picked_position INTO pos FROM social_private.pick(gen_random_uuid()::text,gen_random_uuid(),cardinality(leaders));
  chosen:=array_append(chosen,leaders[pos+1]);
 END IF;
 SELECT coalesce(array_agg(u ORDER BY u),ARRAY[]::uuid[]) INTO pool FROM unnest(ids) u WHERE NOT(u=ANY(chosen));
 FOR i IN 1..least(2,cardinality(pool)) LOOP
  SELECT picked_position INTO pos FROM social_private.pick(gen_random_uuid()::text,gen_random_uuid(),cardinality(pool));
  who:=pool[pos+1]; chosen:=array_append(chosen,who); pool:=array_remove(pool,who);
 END LOOP;
 INSERT INTO social_private.allocations VALUES(p_trip,day,tz,ids,leaders,chosen);
 FOREACH who IN ARRAY chosen LOOP
  reason:=CASE WHEN cardinality(leaders)>0 AND who=chosen[1] THEN 'leader' ELSE 'random' END;
  INSERT INTO public.headshot_rights(trip_id,user_id,local_day,timezone,expires_at,reason)
  VALUES(p_trip,who,day,tz,(day+1)::timestamp AT TIME ZONE tz,reason) RETURNING id INTO r;
  PERFORM social_private.emit(p_trip,'headshot_grant',NULL,who,r,'Headshot','Du har én frivillig Headshot i dag.',ARRAY[who]);
 END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.social_command(p_actor uuid,p_trip uuid,p_action text,p_key uuid,
 p_source uuid DEFAULT NULL,p_target uuid DEFAULT NULL,p_text text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE t public.trips; d public.shot_draws; e public.social_events; right_row public.headshot_rights;
 ids uuid[]; stamp timestamptz; day date; seed text; ph text; req_hash text; previous social_private.commands;
 result jsonb; new_id uuid:=gen_random_uuid(); n int; BEGIN
 -- Serialize commands on this trip; consistent trip/profile/member locks with worker.
 SELECT * INTO STRICT t FROM public.trips WHERE id=p_trip FOR UPDATE;
 PERFORM 1 FROM public.profiles p JOIN public.trip_members m ON p.id=m.user_id
 WHERE m.trip_id=p_trip ORDER BY p.id FOR SHARE OF p,m;
 IF p_actor IS NULL OR NOT public.is_approved_trip_member(p_trip,p_actor) THEN RAISE EXCEPTION 'not_trip_member' USING ERRCODE='42501'; END IF;
 IF t.status<>'active' THEN RAISE EXCEPTION 'trip_read_only' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'idempotency_required'; END IF;
 stamp:=clock_timestamp(); day:=(stamp AT TIME ZONE t.timezone)::date;
 req_hash:=social_private.hash(jsonb_build_array(p_action,p_source,p_target,p_text)::text);
 SELECT * INTO previous FROM social_private.commands WHERE trip_id=p_trip AND actor_id=p_actor AND key=p_key;
 IF FOUND THEN
  IF previous.request_hash<>req_hash THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN previous.result;
 END IF;
 ids:=social_private.eligible(p_trip);
 IF p_action='vibe_start' THEN
  IF length(coalesce(p_text,''))>160 THEN RAISE EXCEPTION 'place_too_long'; END IF;
  IF EXISTS(SELECT 1 FROM public.social_events WHERE trip_id=p_trip AND actor_id=p_actor AND kind='vibe' AND ended_at IS NULL) THEN RAISE EXCEPTION 'vibe_already_active'; END IF;
  IF EXISTS(SELECT 1 FROM public.social_events WHERE trip_id=p_trip AND actor_id=p_actor AND kind='vibe' AND created_at>stamp-interval '5 minutes') THEN RAISE EXCEPTION 'vibe_cooldown'; END IF;
  new_id:=social_private.emit(p_trip,'vibe',p_actor,NULL,new_id,'God stemning',
   social_private.name(p_actor)||' melder god stemning'||CASE WHEN nullif(btrim(p_text),'') IS NULL THEN '' ELSE ' · '||btrim(p_text) END,array_remove(ids,p_actor));
 ELSIF p_action='vibe_end' THEN
  SELECT * INTO STRICT e FROM public.social_events WHERE id=p_source AND trip_id=p_trip AND kind='vibe' FOR UPDATE;
  IF e.actor_id<>p_actor THEN RAISE EXCEPTION 'not_owner' USING ERRCODE='42501'; END IF;
  UPDATE public.social_events SET ended_at=coalesce(ended_at,stamp) WHERE id=e.id; new_id:=e.id;
 ELSIF p_action IN ('read','dismiss') THEN
  UPDATE public.in_app_notifications SET read_at=coalesce(read_at,stamp),
   dismissed_at=CASE WHEN p_action='dismiss' THEN coalesce(dismissed_at,stamp) ELSE dismissed_at END
  WHERE id=p_source AND trip_id=p_trip AND recipient_id=p_actor RETURNING id INTO new_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_recipient' USING ERRCODE='42501'; END IF;
 ELSIF p_action='shot_start' THEN
  PERFORM social_private.finalize(p_trip,stamp);
  IF EXISTS(SELECT 1 FROM public.shot_draws WHERE trip_id=p_trip AND status='countdown') THEN RAISE EXCEPTION 'draw_active'; END IF;
  SELECT count(*) INTO n FROM public.shot_draws WHERE trip_id=p_trip AND initiated_by=p_actor AND kind='draw' AND local_day=day;
  IF n>=5 THEN RAISE EXCEPTION 'daily_limit'; END IF;
  IF cardinality(ids)=0 THEN RAISE EXCEPTION 'no_participants'; END IF;
  seed:=gen_random_uuid()::text||gen_random_uuid()::text; ph:=social_private.hash(array_to_string(ids,','));
  INSERT INTO public.shot_draws(id,trip_id,initiated_by,idempotency_key,status,draw_at,local_day,timezone,participant_count,participant_hash,seed_commitment)
  VALUES(new_id,p_trip,p_actor,p_key::text,'countdown',stamp+interval '10 seconds',day,t.timezone,cardinality(ids),ph,social_private.hash(seed||':'||new_id::text||':'||ph));
  INSERT INTO public.shot_draw_participants(draw_id,trip_id,user_id,position)
  SELECT new_id,p_trip,u,ord-1 FROM unnest(ids) WITH ORDINALITY a(u,ord);
  INSERT INTO social_private.draw_secrets VALUES(new_id,seed);
  PERFORM social_private.emit(p_trip,'shot_start',p_actor,NULL,new_id,'Shot your shot','Trekning om 10 sekunder. Helt frivillig.',ids);
 ELSIF p_action='headshot' THEN
  IF p_target IS NULL OR p_target=p_actor OR NOT(p_target=ANY(ids)) THEN RAISE EXCEPTION 'invalid_target'; END IF;
  SELECT * INTO STRICT right_row FROM public.headshot_rights WHERE id=p_source AND trip_id=p_trip AND user_id=p_actor FOR UPDATE;
  IF right_row.consumed_by IS NOT NULL THEN RAISE EXCEPTION 'right_used'; END IF;
  IF right_row.expires_at<=stamp OR right_row.local_day<>day OR right_row.timezone<>t.timezone THEN RAISE EXCEPTION 'right_expired'; END IF;
  INSERT INTO public.shot_draws(id,trip_id,initiated_by,kind,idempotency_key,status,draw_at,finalized_at,local_day,timezone,participant_count,participant_hash,seed_commitment,winner_id,algorithm_version)
  VALUES(new_id,p_trip,p_actor,'headshot',p_key::text,'finalized',stamp,stamp,day,t.timezone,cardinality(ids),social_private.hash(array_to_string(ids,',')),'',p_target,'targeted-headshot-v1');
  INSERT INTO public.shot_draw_participants(draw_id,trip_id,user_id,position)
  SELECT new_id,p_trip,u,ord-1 FROM unnest(ids) WITH ORDINALITY a(u,ord);
  UPDATE public.headshot_rights SET consumed_by=new_id WHERE id=right_row.id;
  PERFORM social_private.emit(p_trip,'headshot_result',p_actor,p_target,new_id,'Headshot',social_private.name(p_actor)||' ga Headshot til '||social_private.name(p_target)||'. Helt frivillig.',ids);
 ELSIF p_action='respond' THEN
  IF p_text IS NULL OR p_text NOT IN ('taken','declined') THEN RAISE EXCEPTION 'invalid_response'; END IF;
  SELECT * INTO STRICT d FROM public.shot_draws WHERE id=p_source AND trip_id=p_trip FOR UPDATE;
  IF d.status<>'finalized' OR d.winner_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'not_winner' USING ERRCODE='42501'; END IF;
  IF d.response IS NOT NULL AND d.response<>p_text THEN RAISE EXCEPTION 'already_answered'; END IF;
  IF d.response IS NULL THEN
   UPDATE public.shot_draws SET response=p_text,responded_at=stamp WHERE id=d.id;
   SELECT array_agg(user_id ORDER BY position) INTO ids FROM public.shot_draw_participants WHERE draw_id=d.id;
   PERFORM social_private.emit(p_trip,'shot_response',p_actor,p_actor,d.id,'Shot your shot',social_private.name(p_actor)||CASE WHEN p_text='taken' THEN ' tok shot.' ELSE ' feiget ut.' END,ids);
  END IF; new_id:=d.id;
 ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 result:=jsonb_build_object('id',new_id,'committed',true);
 INSERT INTO social_private.commands VALUES(p_trip,p_actor,p_key,req_hash,result);
 RETURN result; END $$;

-- Scheduler entry: no client, no arbitrary timestamp, no archived-trip mutation.
CREATE OR REPLACE FUNCTION public.social_tick() RETURNS int LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE t record; n int:=0; stamp timestamptz:=clock_timestamp(); BEGIN
 FOR t IN SELECT id FROM public.trips WHERE status='active' ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  PERFORM 1 FROM public.profiles p JOIN public.trip_members m ON p.id=m.user_id WHERE m.trip_id=t.id ORDER BY p.id FOR SHARE OF p,m;
  n:=n+social_private.finalize(t.id,stamp);
  -- Don't award yesterday's leader until every yesterday-due draw is finalized.
  PERFORM social_private.allocate(t.id,stamp);
 END LOOP; RETURN n; END $$;

CREATE OR REPLACE FUNCTION public.social_outbox_claim(p_limit int DEFAULT 10)
 RETURNS SETOF public.notification_outbox LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 -- Expire well inside provider's 30-day dedupe window; never resend ancient rows.
 UPDATE public.notification_outbox SET status='expired' WHERE status IN ('pending','leased') AND created_at<clock_timestamp()-interval '1 day';
 RETURN QUERY WITH q AS (
  SELECT id FROM public.notification_outbox WHERE status IN ('pending','leased') AND available_at<=clock_timestamp()
   AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY available_at,id
   FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),20))
 UPDATE public.notification_outbox o SET status='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1
 FROM q WHERE o.id=q.id RETURNING o.*;
 END $$;
CREATE OR REPLACE FUNCTION public.social_outbox_finish(p_id uuid,p_lease uuid,p_status text,p_provider_id text DEFAULT NULL,p_error text DEFAULT NULL,p_retry_seconds int DEFAULT 30)
 RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF p_status NOT IN ('accepted','pending','failed','suppressed') OR (p_status='accepted' AND nullif(btrim(p_provider_id),'') IS NULL) THEN RAISE EXCEPTION 'invalid_delivery_status'; END IF;
 UPDATE public.notification_outbox SET status=CASE WHEN p_status='pending' AND attempts>=12 THEN 'failed' ELSE p_status END,
  provider_message_id=p_provider_id,last_error=left(p_error,240),accepted_at=CASE WHEN p_status='accepted' THEN clock_timestamp() ELSE NULL END,
  available_at=clock_timestamp()+make_interval(secs=>least(greatest(p_retry_seconds,1),86400)),lease_token=NULL,lease_until=NULL
 WHERE id=p_id AND status='leased' AND lease_token=p_lease AND lease_until>clock_timestamp();
 RETURN FOUND; END $$;

CREATE OR REPLACE FUNCTION public.social_snapshot(p_actor uuid,p_trip uuid) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$ DECLARE answer jsonb; BEGIN
 IF p_actor IS NULL OR NOT public.is_approved_trip_member(p_trip,p_actor) THEN RAISE EXCEPTION 'not_trip_member' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
 'trip_id',t.id,'server_now',clock_timestamp(),'trip_day',(clock_timestamp() AT TIME ZONE t.timezone)::date,'writable',t.status='active',
 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',social_private.name(m.user_id)) ORDER BY m.user_id),'[]') FROM public.trip_members m WHERE m.trip_id=p_trip AND public.is_approved_trip_member(p_trip,m.user_id)),
 'events',(SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC),'[]') FROM (SELECT * FROM public.social_events WHERE trip_id=p_trip ORDER BY created_at DESC LIMIT 200)x),
 'unread_count',(SELECT count(*) FROM public.in_app_notifications WHERE trip_id=p_trip AND recipient_id=p_actor AND read_at IS NULL AND dismissed_at IS NULL),
 'notifications',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'event_id',n.event_id,'read_at',n.read_at,'dismissed_at',n.dismissed_at,'event',e) ORDER BY n.created_at DESC),'[]') FROM (SELECT * FROM public.in_app_notifications WHERE trip_id=p_trip AND recipient_id=p_actor ORDER BY created_at DESC LIMIT 200)n JOIN public.social_events e ON e.id=n.event_id),
 'active_vibe',(SELECT to_jsonb(e) FROM public.social_events e WHERE trip_id=p_trip AND actor_id=p_actor AND kind='vibe' AND ended_at IS NULL),
 'draws',(SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC),'[]') FROM (SELECT * FROM public.shot_draws WHERE trip_id=p_trip ORDER BY created_at DESC LIMIT 100)x),
 'participants',(SELECT coalesce(jsonb_agg(p ORDER BY p.draw_id,p.position),'[]') FROM public.shot_draw_participants p WHERE p.draw_id IN (SELECT id FROM public.shot_draws WHERE trip_id=p_trip ORDER BY created_at DESC LIMIT 100)),
 'rights',(SELECT coalesce(jsonb_agg(r),'[]') FROM public.headshot_rights r WHERE trip_id=p_trip AND user_id=p_actor AND local_day=(clock_timestamp() AT TIME ZONE t.timezone)::date AND expires_at>clock_timestamp() AND timezone=t.timezone),
 'starts_today',(SELECT count(*) FROM public.shot_draws WHERE trip_id=p_trip AND initiated_by=p_actor AND kind='draw' AND local_day=(clock_timestamp() AT TIME ZONE t.timezone)::date),
 'stats',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT winner_id AS user_id,
 count(*) FILTER(WHERE kind='draw') AS draws,count(*) FILTER(WHERE kind='headshot') AS headshots,
 count(*) FILTER(WHERE response='taken') AS taken,count(*) FILTER(WHERE response='declined') AS declined,
 count(*) FILTER(WHERE kind='draw' AND (draw_at AT TIME ZONE t.timezone)::date=(clock_timestamp() AT TIME ZONE t.timezone)::date) AS draws_today,
 count(*) FILTER(WHERE kind='headshot' AND (draw_at AT TIME ZONE t.timezone)::date=(clock_timestamp() AT TIME ZONE t.timezone)::date) AS headshots_today,
 count(*) FILTER(WHERE response='taken' AND (draw_at AT TIME ZONE t.timezone)::date=(clock_timestamp() AT TIME ZONE t.timezone)::date) AS taken_today,
 count(*) FILTER(WHERE response='declined' AND (draw_at AT TIME ZONE t.timezone)::date=(clock_timestamp() AT TIME ZONE t.timezone)::date) AS declined_today
 FROM public.shot_draws WHERE trip_id=p_trip AND status='finalized' GROUP BY winner_id)x)) INTO answer FROM public.trips t WHERE t.id=p_trip;
 RETURN answer; END $$;

-- Cursor history preserves all events without unbounded initial payloads.
CREATE OR REPLACE FUNCTION public.social_history(p_actor uuid,p_trip uuid,p_kind text,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE items jsonb; last_item jsonb; BEGIN
 IF NOT public.is_approved_trip_member(p_trip,p_actor) THEN RAISE EXCEPTION 'not_trip_member'; END IF;
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'bad_request'; END IF;
 IF p_kind='vibe' THEN
  SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC,id DESC),'[]') INTO items FROM
   (SELECT * FROM public.social_events WHERE trip_id=p_trip AND kind='vibe' AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)x;
 ELSIF p_kind='draws' THEN
  SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC,id DESC),'[]') INTO items FROM
   (SELECT * FROM public.shot_draws WHERE trip_id=p_trip AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)x;
 ELSIF p_kind='notifications' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('event',e) ORDER BY n.created_at DESC,n.id DESC),'[]') INTO items FROM
   (SELECT * FROM public.in_app_notifications WHERE trip_id=p_trip AND recipient_id=p_actor AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)n
   JOIN public.social_events e ON e.id=n.event_id;
 ELSE RAISE EXCEPTION 'bad_request'; END IF;
 last_item:=items->(jsonb_array_length(items)-1);
 RETURN jsonb_build_object('items',items,'cursor',CASE WHEN jsonb_array_length(items)=50 THEN jsonb_build_object('before',last_item->'created_at','id',last_item->'id') ELSE NULL END);
END $$;
CREATE OR REPLACE FUNCTION public.social_event(p_actor uuid,p_trip uuid,p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.social_events; BEGIN
 IF NOT public.is_approved_trip_member(p_trip,p_actor) THEN RAISE EXCEPTION 'not_trip_member'; END IF;
 SELECT * INTO e FROM public.social_events WHERE id=p_event AND trip_id=p_trip;
 IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found'; END IF;
 RETURN jsonb_build_object('event',to_jsonb(e),'draw',(SELECT to_jsonb(d) FROM public.shot_draws d WHERE d.id=e.source_id AND d.trip_id=p_trip));
END $$;

-- Every new RPC is service-only; Edge verifies JWT before supplying p_actor.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='social_private' OR (n.nspname='public' AND p.proname IN ('social_command','social_tick','social_outbox_claim','social_outbox_finish','social_snapshot','social_history','social_event')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
-- Realtime remains off until the explicit activation script (no hidden live side effects).
COMMIT;
