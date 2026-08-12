# Shot v2 – runbook (status og manuelle steg)

Sist oppdatert: 12. august 2026. Gjelder ny Shot-trekning (`shot_draws`),
ikke legacy gamification.

## Statusskille (ærlig)

| Lag | Status |
| --- | --- |
| Kode / preview | Implementert og verifisert lokalt: `src/features/shot/*`, `src/hooks/useShotDraw.ts`, `src/pages/ShotScreen.tsx`, `supabase/functions/shot-draw/*`. Full testsuite, `tsc --noEmit` og build kjørt lokalt. |
| Pending migrasjoner | `supabase/migrations-pending/20260810_shot_draws.sql` og `20260811_shot_background_sweep.sql`. **Ikke kjørt.** Nye tabeller finnes ikke i produksjon. |
| Edge Function | `shot-draw` er **ikke deployet**. Ingen produksjonsbevis for pushflyt. |
| Publisert frontend | Shot v2 er **ikke publisert**. |
| Produksjon | Uendret. Legacy `shot_events` (94), `shot_event_log` (283), `shot_tokens` (9) er bevart. `notification_dispatches` er tom. |

## Designkontrakt

- **Snapshot-mottakere**: både start- og resultatpush henter bruker-ID-er kun fra
  `shot_draw_participants` for `draw_id`, deretter filtrert på leverbare
  pushaliaser. Medlemsendring etter start endrer aldri mottakersettet.
- **Atomisk dispatch**: `rpc_notification_dispatch_claim` gjør
  `INSERT ... ON CONFLICT DO UPDATE` med CAS på `sent_at IS NULL` og
  `lease_expires_at <= now()`. Status: `claimed` / `retry` / `busy` /
  `already_sent`. `attempts` øker nøyaktig ved vunnet claim.
  `mark_sent` og `mark_failed` krever gyldig `lease_token`. Ingen DELETE.
- **Provider-idempotens**: OneSignal kalles med den stabile
  `provider_idempotency_key`, slik at retry etter «provider ok, mark_sent
  feilet» ikke gir dobbel varsling. Tapt lease kan aldri markere sendt.
- **Serverbakgrunn**: ved `action:"start"` planlegger Edge
  `EdgeRuntime.waitUntil` som venter til `draw_at` (serverdata) og
  service-finaliserer + sender resultatpush uten klient. Feil logges.
- **Cron-sweep** (`10 seconds`) er kun et idempotent reparasjonsnett.
  Den lover ikke eksakt tidspunkt: i verste fall inntil omtrent ett intervall
  forsinkelse hvis Edge-invokasjonen ble avbrutt.
- **Autoritativ vei**: klienten starter/finaliserer/reparerer kun via Edge.
  Ingen klienttimer er sannhetskilde; `server_now` styrer nedtellingen.
- **Legacy** låses ikke-destruktivt: `REVOKE ALL` fra PUBLIC/anon/authenticated
  på `shot_events`, `shot_event_log`, `shot_tokens` og legacy shot-RPC-er.
  Ingen DROP/DELETE/TRUNCATE noe sted.
- **Ingen særregler**: admin/Eskil har nøyaktig samme 1/N som alle andre.

## Manuelle steg (ikke utført)

1. **Secrets** – Project Settings → Secrets:
   - `SHOT_SWEEP_SECRET` (nytt, langt tilfeldig)
   - `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` (finnes allerede)
   - `APP_URL` (valgfri, default `https://guttahutte.lovable.app`)
   Vault (for cron), kjør som datakall:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<samme verdi som SHOT_SWEEP_SECRET>', 'shot_sweep_secret');
   ```
2. **Migrasjon** – kjør `20260810_shot_draws.sql` som migrasjon. Verifiser
   etterpå at nye tabeller finnes, at RLS er på, og at legacy-tabellene fortsatt
   har uendret radantall (94 / 283 / 9).
3. **Edge deploy** – deploy `shot-draw`. `supabase/config.toml` setter
   `verify_jwt = false` fordi sweep har egen konstant-tids secret-sjekk;
   alle andre actions krever gyldig bruker-JWT i koden.
4. **Cron** – kjør `20260811_shot_background_sweep.sql` som datakall
   (prosjektspesifikt). Kontroller `select * from cron.job where jobname =
   'shot-draw-sweep'`.
5. **Negative RLS/integrasjonstester** (mot preview, ikke prod-data):
   - ikke-medlem får `not_trip_member` på `rpc_shot_current` / `rpc_shot_start`
   - arkivert tur gir `trip_archived`
   - `authenticated` kan ikke lese `shot_draw_secrets`
   - `authenticated` kan ikke kjøre `rpc_notification_dispatch_*`
   - legacy `rpc_start_shot_round` gir permission denied etter låsen
   - to parallelle `start` gir én `shot_draws`-rad og én start-push
   - drep klienten under nedtelling → resultatpush kommer likevel
6. **Frontend publish** – først etter at 1–5 er grønt.

## Rullback

Ingen destruktive steg. Ved problemer: `select cron.unschedule('shot-draw-sweep')`,
slå av Edge-funksjonen, og la de nye tabellene ligge urørt. Legacy-data er ikke
berørt av noe steg over.
