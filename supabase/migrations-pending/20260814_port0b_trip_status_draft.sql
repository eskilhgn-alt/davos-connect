-- ============================================================================
-- PORT 0b (steg 1 av 2) — EKSPLISITT statusmodell: draft / active / archived.
--
-- CODE ONLY / PENDING: IKKE kjørt mot produksjon.
-- Kjøres ETTER 20260813_port0_trip_model_authz.sql og FØR
-- 20260815_port0c_trip_rpc_hardening.sql.
--
-- Hvorfor egen fil: Postgres tillater ikke at en ny enum-verdi BRUKES i samme
-- transaksjon som ADD VALUE. Denne filen gjør derfor kun typeutvidelsen; all
-- bruk ligger i neste, sekvensierte migrasjon.
--
-- Idempotens: ADD VALUE IF NOT EXISTS. Ingen rad endrer status her — en
-- eksisterende 'active'/'archived'-rad blir ALDRI omskrevet til 'draft'.
-- ============================================================================

ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'draft';
