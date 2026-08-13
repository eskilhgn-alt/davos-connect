-- ============================================================================
-- Shot bakgrunnsfinalisering — reparasjonsnett. CODE ONLY, ikke kjørt i prod.
--
-- Primærveien er Edge Function `shot-draw` som ved action:"start" bruker
-- EdgeRuntime.waitUntil til å vente til draw_at og deretter service-finalisere
-- og sende resultatpush uten at noen klient er åpen.
--
-- Denne cron-jobben er KUN et idempotent sikkerhetsnett (f.eks. hvis Edge-
-- invokasjonen ble avbrutt). Den lover IKKE eksakt 10 sekunder: en forfalt
-- trekning kan i verste fall bli inntil omtrent ett intervall forsinket.
--
-- Hemmeligheter hentes fra Supabase Vault ved runtime. Ingen literal
-- anon key, service key eller sweep-secret i denne filen.
--
-- MANUELT FØR KJØRING (se docs/SHOT_RUNBOOK.md):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<samme verdi som Edge SHOT_SWEEP_SECRET>', 'shot_sweep_secret');
-- Ingen DROP/DELETE/TRUNCATE av brukerdata.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent upsert av jobben: samme jobbnavn, uten å slette brukerdata.
DO $$
DECLARE
  v_job_id bigint;
  v_command text;
  v_schedule text := '10 seconds';
BEGIN
  v_command := $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
             || '/functions/v1/shot-draw',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-shot-sweep-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'shot_sweep_secret')
      ),
      body := '{"action":"sweep"}'::jsonb,
      timeout_milliseconds := 8000
    );
    $job$;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'shot-draw-sweep';

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('shot-draw-sweep', v_schedule, v_command);
  ELSE
    -- Idempotent oppdatering på plass: ingen unschedule/recreate, ingen
    -- vindu der sweepen ikke er planlagt.
    PERFORM cron.alter_job(
      job_id   := v_job_id,
      schedule := v_schedule,
      command  := v_command,
      active   := true
    );
  END IF;
END $$;
