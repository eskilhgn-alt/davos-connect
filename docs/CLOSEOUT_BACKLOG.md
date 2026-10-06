# Avslutningsliste — GüttaHütte

## Gjeldende arbeidskø — 20. september 2026

Denne køen overstyrer eldre behold-/stoppbeskjeder og historiske tabellstatuser nedenfor.
Les `CLEANUP_20260920.md` og `SOCIAL_FEATURES_20260920.md` før arbeid.

| ID | Faktisk status / neste handling |
| --- | --- |
| CLEAN-01A | Testet kodepakke fra aktiv base 28284b4, 481 tester + tsc/build. 18 kilde-/testfiler fjernet og felles koblinger ryddet. **Ikke importert i Lovable ennå.** Importer forberedt oppfølger fra codex/cleanup-20260920 og kontroller aktive filer. |
| CLEAN-01B | **Åpen:** avvikle faktisk deployede Edge/RPC/grants/jobber for Runder, Faktasjekk og Avstemninger; bevar historiske data. |
| CHAT-MEDIA-01 | **Åpen:** flytt galleri/historier/story-linjer og all tilhørende funksjon inn i Chat, fjern egne fliser/sider etterpå. |
| CAM-01 | **Verifisert i aktiv Lovable 28284b4:** én spiller, snapshots, stabil utvidelse/retry. |
| CAM-02 | **Åpen:** ekte videokilde og fysisk oppstarts-/PWA-test; Skaping er ImageMedia. |
| VIBE-01 / SHOT-02 / SHOT-03 | **Spesifisert, ikke aktivert:** God stemning → Shot your shot → daglige Headshot. |
| SAVE-01 / MOB-01 | DB-/Realtime-retting levert 17.09; faktisk innlogget to-enhetstest/fysisk PWA gjenstår. Ikke gjenta DB-leveransen uten konkret ny feil. |
| STOP-01 | Daglig oppgave reaktivert fra 21.09; selvstopp først når hele avtalt liste er bevist lukket, eller pause ved bare manuelle porter. |

Forbruk 20.09: tre fullførte jobber rapportert 1,3 + 1,6 + 1,3 = 4,2.
Ingen ny byggejobb startet for denne pakken; eksakt saldo ukjent.
Kodepakken og denne teksten er forberedt for neste nyttige import; kunnskap og
oppgave er allerede oppdatert. Skill forberedelse fra aktiv preview.

## Historiske bevis og tidligere kjøringer

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
| DATA-01 | Turbundet dataintegritet: `trip_id` på chat, stories, medier, agenda, Shot, posisjoner | **Delvis** | Klientscoping på plass; RLS-bevis mangler |
| DATA-02 | Posisjoner: fler-tur `user_locations`, turfiltrert realtime, reparasjons-refetch fjerner slettede rader | **Delvis** | `useUserLocations.ts` + `user-locations-runtime.test.tsx` importert og grønne. RLS-/DB-bevis mangler |
| FLOW-01 | Beholdte basisflyter testet: Chat med Minner/Stories, Plan, Vær/skred, Kart, Webkameraer, Deltakere, Innstillinger, Admin | **Åpen** | Kun delvis enhetstestdekning |
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

## Avgrenset UI-opprydding 17. september 2026 (kveld)

- Omfang: kun Mer-skjermen og Oppdag-skjermen. Ingen backend-, tjeneste- eller dataendringer.
- Mer: seksjonen «Fest og spill» heter nå «Verktøy» (intern variabel `tools`). Alle fliser, adminbegrensning og navigasjon er uendret.
- Oppdag: ren listevisning — Liste/Kart-veksler og kart-placeholder fjernet. Gütta-match-badge og forklaringen om delt match er fjernet fra skjermen (modulen `guttaMatch.ts` og EØS-testene er urørt). Kategori-/stedsvisning, feil/tom/lasting, arkivgrense, oppdatering, Google-attribution, eksterne Maps-lenker og admin-konfigurasjonsinngang er beholdt. Kategoriknapper har nå minst 44 px trykkflate.
- Kode/preview: ferdig og verifisert med eksisterende Vitest-sett og automatisk preview-bygg. Produksjon: **ikke** publisert — den publiserte appen viser fortsatt den gamle skjermen.
- Fortsatt åpent: SAVE-01, Shot/backend, reell integrasjon/to enheter/fysisk PWA, og øvrige åpne porter i tabellen over. Ingen historiske bevis er endret.

## Ny bestilling 20. september: kameraer og sosiale fliser

Eskil har uttrykkelig utvidet omfanget med God stemning og Shot your shot,
inkludert nye Headshot-rettigheter. Full bestilling, prioritering og testporter
ligger i `SOCIAL_FEATURES_20260920.md`. Ingen av de nye sosiale funksjonene er
ferdig eller aktivert bare fordi spesifikasjonen er lagret. Kameraenes kode-
retting skal importeres/verifiseres i preview; ekte video krever videokilder.
Eksisterende automasjon skal ikke reaktiveres. Bevar SAVE-01 som åpen.

## Import 3. oktober 2026 — CLEAN-01A + CAM-02 aktiv kode
- Start-HEAD `7b0ff928` (= `28284b4` + Lovable-generert previewAuthStorage.ts, uendret). Kilde: GitHub `4c4428199cfa17145a9a4e49fcf20c2e47706f72`, hentet som skrivebeskyttet tarball.
- apply_prepared_cleanup.py: 40 filer verifisert/40 endringer; andre kjøring 0 endringer. apply_prepared_autoplay.py: 8 filer SHA-256-verifisert begge kjøringer. 18 slettinger bekreftet mot start-HEAD.
- Vitest 492/492 i 43 filer, `tsgo --noEmit -p tsconfig.app.json` rent, Vite/PWA-build OK (sw.js), preview build OK.
- CLEAN-01A (klient: Runder/Utlegg, Faktasjekk, Avstemninger fjernet) og CAM-02 (native muted/inline/loop-autoplay av datert Skaping-timelapse) er **aktiv kode/preview**, ikke publisert. Fysisk iPhone-autoplay ikke bevist.
- Åpne: CLEAN-01B (backendavvikling), CHAT-MEDIA-01, SAVE-01 fysisk/to-enhetskontroll. Ingen DB-, Edge-, push- eller publiseringsendring.

## CLEAN-01B — FERDIG 06.10.2026 (erstatter eldre «åpen/testutkast»-status)
- Harness `supabase/tests/clean01b/run.sh`: migrasjon 2×, 23/23 grønne (16/16 klientangrep avvist, uendrede hasher).
- Produksjonsform kontrollert før aktivering; migrasjon aktivert via Lovable-migreringsflyt, historikkversjon 20261006062802.
- Readback etter: radantall 11/79/0/1/2/0/4/26/0 og samlet innholdshash 890f24b0… identisk før/etter; storage chat-media 16, stories 21, round-receipts 1 (uendret). 0 policyer, 0 anon/authenticated/PUBLIC-tilganger, RLS på; polls/poll_votes/rounds ute av Realtime; trigger borte; fire RPC-er 0 klient-EXECUTE, service_role beholdt; storage-policyer kun chat-media/stories; 0 relatert cron.
- Edge: faktasjekker, poll-push, round-push slettet (verktøy bekreftet); shot-draw urørt.
- Linter-INFO «RLS uten policy» på de låste tabellene er tilsiktet.
- Neste: CHAT-MEDIA-01. Åpent: SAVE-01 fysisk/to enheter, fysisk iPhone-autoplay, VIBE, Shot, Headshot, sluttkontroll.
