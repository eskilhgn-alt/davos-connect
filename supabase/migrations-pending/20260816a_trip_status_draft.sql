-- ============================================================================
-- 20260816a — trip_status får verdien 'draft'.
--
-- CODE ONLY / PENDING: ikke kjørt mot den delte appdatabasen.
-- Rekkefølge: DENNE -> 20260816b_trip_save_patch_rpc.sql
--
-- Egen fil fordi Postgres ikke tillater at en ny enum-verdi BRUKES i samme
-- transaksjon som ADD VALUE.
--
-- Idempotent: ADD VALUE IF NOT EXISTS. Ingen eksisterende rad endrer status,
-- ingen backfill, ingen datotukling.
-- ============================================================================

ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'draft';
