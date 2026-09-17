# Avslutningsliste — GüttaHütte

Én fast liste. Status er sannferdig: alt som ikke er bevist i faktisk kjøring
står som **Åpen** eller **Delvis**. Grønne enhetstester er ikke produksjonsbevis.

Sist oppdatert: 16. september 2026. Se `TRIP_SAVE_20260916.md` for den nyere, kontrollerte leveransen. Klientkode under import er ikke aktiv preview.

Realtime er aktivert for trips/trip_members med uendrede datarader. 470/470 klienttester og SQL-atferdstester består. Kompletterende DB-aktivering fikk 499; etterkontroll fikk 504, så enum-status er uavklart. Full SAVE-01 og native samtidighet/to-enhetstest er fortsatt åpne.

| ID | Oppgave | Status | Bevis / gjenstår |
| --- | --- | --- | --- |
| SYNC-01 | Importer commit `ab08f58` (lovable-sync) inn i Lovable: 14 filer + 3 prosjektdokumenter | **Verifisert** | Commit `986661315949a1a97e71759451d4fb2c5a828488`: 14 byte-identiske GitHub-filer, tre lesbare styringsfiler, vitest 468/468 i 42 filer, ren tsc og build |
| SAVE-01 | «Lagre tur»-knapp i turinnstillingene: fast ved skjemabunn, safe-area, ≥44 px, «Lagrer…», blokkert dobbeltklikk, feil/retry, «Lagret» først etter serverbekreftelse + oppdatert delt turtilstand | **Åpen** | Kode importert (AdminTrips.tsx, TripContext.applySavedTrip), synlig knappetekst endret til «Lagre tur», dekket av `trip-save-runtime.test.tsx`. Produksjonsfeilen er **ikke** lukket: mangler verifisering i faktisk app på iPhone og på en annen autorisert enhet |
| PORT0-01 | Turmodell, statusmodell draft/active/archived, IANA-validering, nøyaktig én aktiv tur | **Delvis** | `20260813` + `20260814` skrevet og idempotente. Pending — ikke kjørt i produksjon |
| PORT0-02 | RPC-herding: `rpc_admin_archive_trip` idempotent med advisory lock før radlås, ingen UPDATE/audit på allerede arkivert tur | **Delvis** | `20260815_port0c_trip_rpc_hardening.sql` importert. Pending |
| PORT0-03 | Isolert SQL-harness kjørbar for hele Port 0 (0813 → 0814 → 0815, to runder) | **Åpen** | `run.sh`, `behavior.sql`, `security.sql`, `check-sql.mjs` importert. Harness er **ikke** kjørt i denne runden |
| PORT0-04 | Reell samtidighetstest: to parallelle aktiveringer ender med nøyaktig én aktiv tur | **Åpen** | `concurrency_setup.sql` / `concurrency_assert.sql` finnes, ikke kjørt |
| DATA-01 | Turbundet dataintegritet: `trip_id` på chat, stories, galleri, agenda, polls, runder, Shot, posisjoner | **Delvis** | Klientscoping på plass; RLS-bevis mangler |
| DATA-02 | Posisjoner: fler-tur `user_locations`, turfiltrert realtime, reparasjons-refetch fjerner slettede rader | **Delvis** | `useUserLocations.ts` + `user-locations-runtime.test.tsx` importert og grønne. RLS-/DB-bevis mangler |
| FLOW-01 | Beholdte basisflyter testet: Chat, Minner, Stories, Plan, Avstemninger, Utlegg, Vær/skred, Kart, Webkameraer, Deltakere, Innstillinger, Admin | **Åpen** | Kun delvis enhetstestdekning |
| SHOT-01 | Shot v2 ferdigstilt og adskilt fra legacy | **Åpen** | Kode/pending. Krever manuell deploy, integrasjonstest og eksplisitt godkjenning |
| LEG-01 | Legacy-opprydding: Roomies, Casino, legacy Shot/tokens/poeng/straff, Davos-spesifikk logikk | **Delvis** | Fjernet fra UI/ruter. Data API-/RPC-rettigheter og dokumentasjon må verifiseres |
| MOB-01 | Mobil-/sluttkontroll: iPhone PWA fra hjemmeskjerm, safe-area, 44 px, pull-to-refresh, push | **Åpen** | Krever fysisk enhet |
| STOP-01 | Selvstopp når listen er verifisert lukket | **Åpen** | Kan ikke lukkes før alt over er verifisert |

## Faste grenser

Ingen publisering av frontend, ingen produksjonsmigrasjoner, ingen Edge-deploy,
ingen endring av produksjonsdata eller historikk uten eksplisitt godkjenning.

Avgrenset godkjenning 16. september: Eskil bestilte uttrykkelig retting av
databasefeilen og aktivering av Realtime for turlagring/turmodell/tilgang.
Nødvendige testede endringer for dette er autorisert; frontendpublisering,
andre migrasjoner og sletting er fortsatt utenfor bestillingen.

## Verifisert kjøring 17. september 2026

- Start-HEAD: `e043ab58a43c1d2819448b621fd35cfe8bc819c4`.
- Alle 13 bestilte filer hentet direkte fra GitHub-commit `40aee5119aa58118c8877c2e875b12fbc26d0824` og bytekontrollert etter import. Importcommit: `e614d3da609c2ec6bef640020124f214723af1f2`. Bare denne bevisoppføringen avviker deretter fra kildefilene.
- `bash supabase/tests/trip-save/run.sh`: BESTÅTT på native PostgreSQL 17.9, uid/gid 1000 via setpriv. Midlertidig lokal database med Unix-socket og ingen TCP-lytting; ingen tilkobling til appdatabasen.
- Rekkefølge i importert harness: 20260816a → 20260816b → compatibility guards, to runder. Filene kjøres separat, ikke b+guards i én samlet transaksjon. To parallelle aktiveringer committet; nøyaktig én aktiv tur, den andre mål-turen arkivert. Sluttsignal: TRIP SAVE NATIVE SQL AND CONCURRENCY PASSED.
- Målrettet Vitest: trip-save-runtime, trip-date-sync, trip-dates, trip-dates-zoned: 32/32 tester i 4 filer bestått.
- Hele Vitest: 470/470 tester i 42 filer bestått.
- Automatisk preview-bygg: build OK, logg 2026-09-17T02:07:52Z. Manuell tsc og npm build ble ikke kjørt: miljøets instruksjoner forbyr manuelle bygg/typechecks. Separat tsc-resultat er derfor ikke bekreftet.
- Playwright: preview åpner /auth, innloggingsskjermen vises, ingen pageerror. Ingen innlogget lagring eller fysisk PWA-/to-enhetstest utført.
- SAVE-01 fortsatt Åpen. PORT0-04 har nå isolert native samtidighetsbevis for trip-save-pakken; eldre Port 0-harness og produksjonsbevis er ikke etablert av denne kjøringen. Øvrige åpne porter over er uendret.
- Kredittoppslag etter tester: dagens bokførte build_time-forbruk 1,50; 3,50 av 5 daglige kreditter gjensto. Endelig kostnad for pågående svar er ikke tilgjengelig før avslutning.
- Ingen produksjonsmigrasjon, data-/Realtime-endring, publisering eller Edge-deploy. Arbeidet stopper etter denne avgrensede leveransen; ekstern automasjonsstatus er ikke endret eller verifisert.
