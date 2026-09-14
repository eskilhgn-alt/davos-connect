-- Etter to parallelle aktiveringer: nøyaktig én aktiv tur, og vinneren er en
-- av de to kandidatene (ikke den gamle aktive turen).
DO $$
DECLARE n int; winner uuid;
BEGIN
  SELECT count(*) INTO n FROM public.trips WHERE status = 'active';
  PERFORM public._assert(n = 1, 'parallell aktivering: nøyaktig én aktiv tur etterpå');

  SELECT id INTO winner FROM public.trips WHERE status = 'active';
  PERFORM public._assert(
    winner IN ('44444444-4444-4444-4444-444444444444',
               '55555555-5555-5555-5555-555555555555'),
    'parallell aktivering: vinneren er en av de to kandidatene');
END $$;
