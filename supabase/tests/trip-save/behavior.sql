-- Isolated fixture only. Never execute this file on the app database.
CREATE FUNCTION public.save_assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
END $$;
CREATE FUNCTION public.save_denied(statement text, expected_state text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN
  EXECUTE statement;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = expected_state THEN RETURN true; END IF;
  RAISE;
END $$;

GRANT ALL ON public.trips TO authenticated;
INSERT INTO public.profiles(id,email,membership_status,is_active,is_banned) VALUES
 ('a0000000-0000-0000-0000-000000000001','admin@test.invalid','approved',true,false),
 ('a0000000-0000-0000-0000-000000000002','member@test.invalid','approved',true,false),
 ('a0000000-0000-0000-0000-000000000003','pending@test.invalid','pending',true,false),
 ('a0000000-0000-0000-0000-000000000004','banned@test.invalid','approved',true,true),
 ('a0000000-0000-0000-0000-000000000005','otheradmin@test.invalid','approved',true,false);
INSERT INTO public.user_roles(user_id,role)
 SELECT id,'admin'::public.app_role FROM public.profiles WHERE id <> 'a0000000-0000-0000-0000-000000000002';
INSERT INTO public.trips(id,name,destination,country,timezone,currency,status,start_date,end_date) VALUES
 ('11111111-1111-1111-1111-111111111111','A','Val Thorens','France','Europe/Paris','EUR','active','2027-02-10','2027-02-17'),
 ('22222222-2222-2222-2222-222222222222','B','Oslo','Norway','Europe/Oslo','NOK','draft',null,null),
 ('33333333-3333-3333-3333-333333333333','Archive fixture','Oslo','Norway','Europe/Oslo','NOK','draft',null,null);
INSERT INTO public.trip_members(trip_id,user_id)
 SELECT '11111111-1111-1111-1111-111111111111',id FROM public.profiles WHERE id <> 'a0000000-0000-0000-0000-000000000005';
INSERT INTO public.trip_members(trip_id,user_id) VALUES
 ('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000005'),
 ('33333333-3333-3333-3333-333333333333','a0000000-0000-0000-0000-000000000001');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r public.trips; r2 public.trips; n int; created_id uuid; BEGIN
  SELECT * INTO r FROM public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"name":"Changed"}');
  PERFORM public.save_assert(r.name='Changed' AND r.country='France' AND r.start_date='2027-02-10','omitted fields preserved');
  SELECT * INTO r FROM public.rpc_admin_patch_trip(r.id,'{"country":null,"start_date":null,"end_date":null}');
  PERFORM public.save_assert(r.country IS NULL AND r.start_date IS NULL AND r.end_date IS NULL,'patch clears fields');
  SELECT * INTO r FROM public.rpc_admin_patch_trip(r.id,'{"start_date":"2027-03-01","end_date":"2027-03-08","destination_config":{"custom":null}}');
  SELECT * INTO r FROM public.rpc_admin_update_trip(r.id,p_name=>'Legacy',p_start_date=>NULL,p_destination_config=>'{"custom":null}');
  PERFORM public.save_assert(r.start_date='2027-03-01' AND r.destination_config='{"custom":null}'::jsonb,'legacy null preserves dates and nested config null');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"end_date":"2027-02-01"}')$q$,'23514'),'invalid merged date range');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"timezone":"Nowhere"}')$q$,'22023'),'invalid timezone');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"name":null}')$q$,'23502'),'required name');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"name":42}')$q$,'22023'),'reject scalar coercion');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"status":"active"}')$q$,'22023'),'status not patchable');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_create_trip('','Oslo')$q$,'22023'),'create validation');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_archive_trip('11111111-1111-1111-1111-111111111111')$q$,'42501'),'active cannot archive directly');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_remove_trip_member('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001')$q$,'42501'),'last qualified admin protected');
  DELETE FROM public.trip_members WHERE trip_id='11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.save_assert(n=0,'direct membership deletion blocked');
  UPDATE public.trips SET name='bypass' WHERE id='11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.save_assert(n=0,'direct trip update blocked');
  PERFORM public.save_assert(NOT EXISTS (SELECT 1 FROM public.trips WHERE id='22222222-2222-2222-2222-222222222222'),'global admin cannot read foreign trip');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_update_trip('22222222-2222-2222-2222-222222222222',p_name=>'bypass')$q$,'42501'),'legacy RPC cannot write foreign trip');
  SELECT * INTO r FROM public.rpc_admin_archive_trip('33333333-3333-3333-3333-333333333333');
  SELECT * INTO r2 FROM public.rpc_admin_archive_trip(r.id);
  PERFORM public.save_assert(r IS NOT DISTINCT FROM r2,'repeat archive unchanged');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_update_trip('33333333-3333-3333-3333-333333333333',p_name=>'bypass')$q$,'42501'),'legacy cannot write archive');
  PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('33333333-3333-3333-3333-333333333333','{"name":"bypass"}')$q$,'42501'),'patch cannot write archive');
  SELECT * INTO r FROM public.rpc_admin_create_trip('New draft','Oslo');
  created_id := r.id;
  PERFORM public.save_assert(r.status='draft' AND r.start_date IS NULL AND r.end_date IS NULL,'draft without invented dates');
  PERFORM public.save_assert(public.is_trip_member(r.id,auth.uid()),'creator membership');
  SELECT * INTO r FROM public.rpc_admin_activate_trip(r.id);
  PERFORM public.save_assert(r.status='active' AND (SELECT count(*) FROM public.trips WHERE status='active')=1,'exactly one active after switch');
END $$;
RESET ROLE;
SELECT public.save_assert((SELECT count(*)=1 FROM public.admin_audit_log WHERE action='trip_archived' AND details->>'trip_id'='33333333-3333-3333-3333-333333333333'),'one audit row for repeated archive');
SELECT public.save_assert((SELECT count(*)=1 FROM public.trips WHERE status='active'),'one active globally');

SET ROLE authenticated;
DO $$ DECLARE u text; BEGIN
  FOREACH u IN ARRAY ARRAY['a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000005'] LOOP
    PERFORM set_config('request.jwt.claim.sub',u,false);
    PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_patch_trip('11111111-1111-1111-1111-111111111111','{"name":"bypass"}')$q$,'42501'),'non-admin/pending/banned/foreign patch denied');
    PERFORM public.save_assert(public.save_denied($q$SELECT public.rpc_admin_update_trip('11111111-1111-1111-1111-111111111111',p_name=>'bypass')$q$,'42501'),'non-admin/pending/banned/foreign legacy denied');
    IF u IN ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004') THEN
      PERFORM public.save_assert((SELECT count(*)=0 FROM public.trips),'pending/banned cannot read trips');
      PERFORM public.save_assert((SELECT count(*)=0 FROM public.trip_members),'pending/banned cannot read memberships');
    END IF;
  END LOOP;
END $$;
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false);
SELECT public.save_assert((SELECT count(*)=1 FROM public.trips),'ordinary member reads own archived trip only');
RESET ROLE;
SELECT public.save_assert(NOT has_function_privilege('anon','public.rpc_admin_patch_trip(uuid,jsonb)','EXECUTE'),'anon patch execute denied');
SELECT public.save_assert(NOT has_function_privilege('anon','public.rpc_admin_update_trip(uuid,text,text,text,text,text,date,date,jsonb)','EXECUTE'),'anon legacy execute denied');
SELECT public.save_assert(NOT has_function_privilege('authenticated','public.rpc_admin_adjust_tokens(uuid,integer,text)','EXECUTE'),'legacy gamification remains locked');
SELECT public.save_assert((SELECT count(*)=8 FROM public.user_locations),'locations preserved');
SELECT public.save_assert(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='user_locations' AND column_name='trip_id'),'no location schema mutation');
