# Port 0 — runbook (turmodell, authz og migrasjonsgrunnlag)

Status: **CODE ONLY / PENDING.** Ingenting i denne runbooken er kjørt i
produksjon. Alt ligger i `supabase/migrations-pending/` og må godkjennes
eksplisitt før deploy.

## Hva Port 0 fastsetter

1. **Én autoritativ turmodell**
   - `start_date` / `end_date` forblir nullable. Ingen oppdiktede datoer for
     Val Thorens 2027.
   - `timezone` valideres som ekte IANA-sone i trigger `trips_validate`.
   - `end_date >= start_date` håndheves i samme trigger (ikke CHECK, fordi
     regelen skal kunne utvides med tidsavhengige felt).
   - Nøyaktig én aktiv tur via partial unique index `trips_single_active_idx`.
   - Arkivert tur er lesbar, men ingen bruker-/serverbane kan skrive.

2. **Minst privilegerte authz-hjelpere** (alle `SECURITY DEFINER` med pinnet
   `SET search_path = ''`):
   - `is_trip_member`, `is_approved_trip_member`, `is_trip_admin`
   - `is_trip_active`, `is_trip_writable`, `can_read_trip`, `can_write_trip`
   - `EXECUTE` er fjernet fra `PUBLIC` og `anon`; kun `authenticated` og
     `service_role` får det de faktisk trenger.

3. **Arkivgrense som backstop**: `RESTRICTIVE`-policyer for INSERT/UPDATE/DELETE
   på alle turfølsomme tabeller. React-nivået er bekvemmelighet, ikke sikkerhet.

## Filer

| Fil | Innhold |
| --- | --- |
| `supabase/migrations-pending/20260813_port0_trip_model_authz.sql` | Turmodell, triggere, authz-hjelpere, grants, RESTRICTIVE-policyer, realtime |
| `supabase/migrations-pending/20260810_shot_draws.sql` | Shot v2-skjema + dispatch-lease |
| `supabase/migrations-pending/20260811_shot_background_sweep.sql` | Idempotent `cron.alter_job`-sweep |

Alle tre er additive og idempotente: ingen `DROP`, `DELETE FROM` eller
`TRUNCATE`. Kjøring to ganger på rad gir kun `NOTICE ... already exists`.

## Verifisering før deploy

```bash
bash supabase/tests/port0/run.sh   # ekte, isolert Postgres (initdb, egen socket)
bunx vitest run                    # 449 tester, inkl. Port 0- og Shot-kontrakter
bunx tsgo --noEmit && bun run build
```

`run.sh` starter en midlertidig Postgres-instans, laster fikstur + migrasjon
(to ganger), laster policyer og kjører `behavior.sql`. Testene dekker:

- godkjent medlem kan skrive i aktiv tur; pending/banned kan ikke
- medlem av annen tur har ingen tilgang og ser ingen lekkasje ved SELECT
- arkivert tur er lesbar, men INSERT blokkeres av RESTRICTIVE-backstop
- admin er kun admin i tur hen er medlem av
- ugyldig IANA-sone og ugyldig datointervall avvises; nullable datoer beholdes
- nøyaktig én aktiv tur, også gjennom statusoverganger
- ikke-admin avvises inne i admin-RPC, ikke bare av grants
- `anon`/`PUBLIC` har ingen `EXECUTE` på privilegerte funksjoner
- alle Port 0-`SECURITY DEFINER` har pinnet tom `search_path`
- realtime-publication inneholder hver tabell nøyaktig én gang

## Migrasjonshistorikkdrift

Repositoryet har to kataloger:

- `supabase/migrations/` — historikk som allerede er kjørt i prosjektet.
- `supabase/migrations-pending/` — Port 0 og Shot v2, **ikke** kjørt.

Driften er bevisst: pending-filene er skrevet idempotent slik at de kan kjøres
i vilkårlig rekkefølge etter eksisterende historikk uten å forutsette at
historikken er byte-identisk. Ved deploy:

1. Kjør `20260813_port0_trip_model_authz.sql` først (den definerer authz-
   hjelperne Shot-policyene bruker).
2. Kjør `20260810_shot_draws.sql`.
3. Kjør `20260811_shot_background_sweep.sql` sist (den krever `pg_cron`,
   `pg_net` og Vault-hemmelighetene `shot_sweep_url` + `shot_sweep_secret`).
4. Flytt filene til `supabase/migrations/` med samme innhold, byte-for-byte.

## Shot v2 — de fire lukkede funnene

1. **Finalisering planlegges først.** `scheduleServerFinalize` kalles før og
   uavhengig av startpush; en pushfeil kan ikke lenger hindre at trekningen
   fullføres ved `draw_at`.
2. **Lease-token er obligatorisk.** `rpc_notification_dispatch_mark_sent` og
   `..._mark_failed` krever `p_lease_token IS NOT NULL` og eksakt likhet.
3. **Cron oppdateres idempotent** med `cron.alter_job` — ingen
   `unschedule`/recreate, så jobbhistorikk og id beholdes.
4. **OneSignal-aksept er streng.** `isOneSignalAccepted` godtar bare 2xx med en
   faktisk ikke-tom meldings-ID og uten `errors`; alt annet markeres som
   `push_provider_error` og retryes med stabil `provider_idempotency_key`.

## Kjent begrensning

`run.sh` kjører mot vanilla Postgres uten `pg_cron`, `pg_net` og Vault.
Sweep-migrasjonen dekkes derfor av kontrakttester i
`src/test/port0-and-shot-regressions.test.ts`, ikke av kjøring. Verifiser
sweepen manuelt etter deploy med stegene i `docs/SHOT_RUNBOOK.md`.
