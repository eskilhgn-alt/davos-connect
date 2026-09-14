-- Tas ETTER første migrasjonsrunde. Andre runde skal ikke endre en eneste
-- posisjonsrad — heller ikke de genererte surrogat-UUID-ene.
CREATE TABLE IF NOT EXISTS public._loc_snapshot AS
SELECT id, user_id, trip_id, lat, lon, updated_at FROM public.user_locations;
