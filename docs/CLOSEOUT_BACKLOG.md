# Avslutningsliste — GüttaHütte

Én fast liste. Status er sannferdig: alt som ikke er bevist i faktisk kjøring
står som **Åpen** eller **Delvis**. Grønne enhetstester er ikke produksjonsbevis.

Sist oppdatert: 15. september 2026 (runde SYNC-01).

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
