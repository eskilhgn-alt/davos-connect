-- Isolert etter behavior.sql. Gir tabellrettigheter for å bevise at RLS
-- faktisk stanser direkte mutasjoner, uavhengig av GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;

DO $$
DECLARE n int; blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',true);
  DELETE FROM public.trip_members
    WHERE trip_id='11111111-1111-1111-1111-111111111111'
      AND user_id='a0000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  PERFORM public._assert(n=0,'direkte DELETE kan ikke omgå siste-admin-kontroll');
  SET LOCAL ROLE authenticated;
  UPDATE public.trips SET name='Omgåelse' WHERE id='11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  PERFORM public._assert(n=0,'trips UPDATE blokkeres av RLS selv med tabell-GRANT');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.trip_members(trip_id,user_id)
    VALUES ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000005');
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM public._assert(blocked,'direkte medlems-INSERT må gå gjennom RPC');
  PERFORM public._assert(NOT has_function_privilege('authenticated',
    'public.rpc_admin_adjust_tokens(uuid,integer,text)','EXECUTE'),
    'legacy token-RPC forblir avlåst');
END $$;

-- Egen posisjon kan skrives i riktig aktiv tur.
DO $$
DECLARE n int; blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
  INSERT INTO public.user_locations(user_id,trip_id,lat,lon)
  VALUES ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',45,6);
  SELECT count(*) INTO n FROM public.user_locations;
  RESET ROLE;
  PERFORM public._assert(n=1,'vanlig medlem ser sin egen turbundne posisjon');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.user_locations(user_id,trip_id,lat,lon)
    VALUES ('a0000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333',45,6);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  RESET ROLE;
  PERFORM public._assert(blocked,'eier kan ikke skrive posisjon i en annen tur');
END $$;

-- Legacy og arkivert posisjon kan ikke gjøres skrivbar ved å flytte trip_id.
INSERT INTO public.user_locations(user_id,trip_id,lat,lon) VALUES
 ('a0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',46,7);
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
  UPDATE public.user_locations SET lat=0 WHERE trip_id='22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  PERFORM public._assert(n=0,'egen arkivert posisjon kan ikke oppdateres');
  SET LOCAL ROLE authenticated;
  UPDATE public.user_locations SET trip_id='11111111-1111-1111-1111-111111111111'
    WHERE trip_id='22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  PERFORM public._assert(n=0,'arkivert posisjon kan ikke flyttes til aktiv tur');
END $$;

-- Banned/pending skal heller ikke kunne lese en eksisterende egen rad.
INSERT INTO public.user_locations(user_id,trip_id,lat,lon) VALUES
 ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',45,6),
 ('a0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',45,6);
DO $$
DECLARE u uuid; n int;
BEGIN
  FOREACH u IN ARRAY ARRAY[
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid
  ] LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    SELECT count(*) INTO n FROM public.user_locations;
    RESET ROLE;
    PERFORM public._assert(n=0,'pending/banned/annen-tur ser ingen posisjoner: '||u);
  END LOOP;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',true);
  SELECT count(*) INTO n FROM public.user_locations WHERE trip_id='11111111-1111-1111-1111-111111111111';
  RESET ROLE;
  PERFORM public._assert(n=3,'turadmin kan lese posisjonene i sin egen tur');
END $$;
