-- KODE-ONLY, IKKE KJØRT.
-- Delt server-snapshot for Oppdag (discover-places).
--
-- Ikke-destruktiv og idempotent:
--  * Produksjon er verifisert å IKKE ha denne tabellen.
--  * Migrasjonen inneholder derfor ingen fjerning av tabeller, kolonner
--    eller rader. Kun CREATE ... IF NOT EXISTS, idempotente GRANT/REVOKE
--    og en trygg trigger-opprettelse via guard.
--
-- EØS/vilkår (Google Maps Platform EEA, fra 8. juli 2025):
--  * Snapshotet lagrer BARE provider-nøytrale referanser: place_id og
--    koordinater. Aldri providerinnhold som navn, adresse, vurderinger,
--    antall anmeldelser, åpningstid, prisnivå, bilder eller anmeldelser.
--  * expires_at er alltid satt, og alltid <= 30 dager fram i tid.
--  * Ingen brukerposisjon, ingen bruker-id, ingen rå providerrespons.
--
-- Sikkerhet:
--  * RLS er PÅ uten klientpolicyer: kun Edge Function via service role
--    kan lese/skrive. anon/authenticated får ingen GRANT.
--  * Triggerfunksjonen er også låst: EXECUTE trekkes fra PUBLIC.

CREATE TABLE IF NOT EXISTS public.discover_place_cache (
  cache_key text PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  provider text NOT NULL,
  category text NOT NULL,
  discovery_version text NOT NULL,
  filter_version text NOT NULL,
  place_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
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

-- Håndhev 30-dagersgrensen. CHECK kan ikke bruke now(), derfor trigger.
CREATE OR REPLACE FUNCTION public.discover_place_cache_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '30 days' THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.discover_place_cache_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_place_cache_guard() TO service_role;

-- Idempotent trigger-opprettelse uten destruktiv databehandling.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'discover_place_cache_guard_trg'
      AND c.relname = 'discover_place_cache'
      AND n.nspname = 'public'
  ) THEN
    CREATE TRIGGER discover_place_cache_guard_trg
      BEFORE INSERT OR UPDATE ON public.discover_place_cache
      FOR EACH ROW EXECUTE FUNCTION public.discover_place_cache_guard();
  END IF;
END
$do$;
