-- Fikstur for den ekte parallelle aktiveringstesten. To turer, samme turadmin.
DO $$
DECLARE
  t_a uuid := '44444444-4444-4444-4444-444444444444';
  t_b uuid := '55555555-5555-5555-5555-555555555555';
  admin_id uuid := 'a0000000-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO public.trips (id,name,destination,timezone,currency,status)
  VALUES (t_a,'Par A','A','Europe/Paris','EUR','draft')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.trips (id,name,destination,timezone,currency,status)
  VALUES (t_b,'Par B','B','Europe/Paris','EUR','draft')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.trip_members (trip_id,user_id)
  VALUES (t_a,admin_id),(t_b,admin_id) ON CONFLICT DO NOTHING;
END $$;
