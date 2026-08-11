-- ============================================================================
-- Shot bakgrunnsfinalisering ved draw_at — CODE ONLY, ikke kjørt i produksjon.
--
-- Serveren skal avgjøre trekningen selv om alle klienter er lukket.
-- Cron kaller Edge Function `shot-draw` med action "sweep" hvert minutt.
-- Sweep bruker service_role-RPC-ene rpc_shot_due_draws_all og
-- rpc_shot_finalize_service, og sender deduplisert resultat-push.
--
-- MANUELT FØR KJØRING:
--   1) Sett <PROJECT_REF> og <ANON_KEY> nedenfor.
--   2) Sett samme hemmelighet i Edge-env SHOT_SWEEP_SECRET og i headeren under.
--   3) Kjør denne som datakall (ikke som delt migrasjon) fordi den inneholder
--      prosjektspesifikke verdier.
-- Ingen DROP/DELETE/TRUNCATE av brukerdata.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'shot-draw-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/shot-draw',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>","x-shot-sweep-secret":"<SHOT_SWEEP_SECRET>"}'::jsonb,
    body := '{"action":"sweep"}'::jsonb
  );
  $$
);
