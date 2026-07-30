-- KODE-ONLY, IKKE KJØRT.
-- Delt servercache for Oppdag (discover-places). Ikke-destruktiv: oppretter
-- kun én ny tabell. Ingen eksisterende data berøres.
--
-- Personvern/sikkerhet:
--  * Ingen brukerposisjon, bruker-id eller rå providerrespons lagres.
--  * RLS er PÅ uten klientpolicyer: kun Edge Function via service role
--    kan lese/skrive. anon/authenticated får ingen GRANT.

CREATE TABLE IF NOT EXISTS public.discover_place_cache (
  cache_key text PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  provider text NOT NULL,
  category text NOT NULL,
  discovery_version text NOT NULL,
  filter_version text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Kun service role. Ingen GRANT til anon/authenticated.
REVOKE ALL ON public.discover_place_cache FROM anon, authenticated;
GRANT ALL ON public.discover_place_cache TO service_role;

ALTER TABLE public.discover_place_cache ENABLE ROW LEVEL SECURITY;
-- Bevisst ingen policyer: tabellen er låst for alle klientroller.

CREATE UNIQUE INDEX IF NOT EXISTS discover_place_cache_key_uidx
  ON public.discover_place_cache (cache_key);
CREATE INDEX IF NOT EXISTS discover_place_cache_trip_expires_idx
  ON public.discover_place_cache (trip_id, expires_at DESC);

CREATE TRIGGER discover_place_cache_set_updated_at
  BEFORE UPDATE ON public.discover_place_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
