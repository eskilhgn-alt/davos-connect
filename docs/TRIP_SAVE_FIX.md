# Turlagring og global oppdatering — 14. september 2026

Eskil melder at dato og informasjon kan fylles ut, men ikke lagres slik at hele appen oppdateres. Dette er første prioritet i avslutningsarbeidet. Utgangspunkt: verifisert GitHub-commit `3a5f3d9f9ef518ae5f0f53006f9ab8c014a859fa`.

## Verifiserte funn og rettinger

- Urørt, ufullstendig destinasjons-/Oppdag-konfigurasjon kunne blokkere lagring av datoer og navn. Valideringen følger nå faktisk endrede felt. Endrede kartverdier valideres fortsatt; ukjente konfigurasjonsfelt bevares.
- `TripProvider` satte global loading ved hver bakgrunnslesing. `AdminTrips` avmonterte dermed det åpne skjemaet og mistet utkastet. Bakgrunnslesinger beholder nå skjemaet.
- Lagringen kunne vente på alle andre turavhengige nettverkskall etter at serveren allerede hadde bekreftet lagring. Den bekreftede raden synkes umiddelbart; de andre datakildene oppdateres i bakgrunnen.
- Returen kontrolleres nå også mot tur-ID, navn, destinasjon og land. Lagringsfeil vises ved Lagre-knappen; skjemaet og inntastede verdier beholdes ved feil.
- Skjemaet rendres utenfor appens scrollcontainere med portal og eksisterende fast footer/safe-area.
- Nye turdata leses ved gjenvunnet fokus, nettverk, synlig app og Realtime-tilkobling, slik at tapte hendelser kan repareres.

Fem av de seks første nye atferdstestene feilet før rettingen og besto etterpå. Det er feilbaner som faktisk er reprodusert i koden; det er ikke bevist hvilken feilbane Eskils konkrete telefon traff.

## Kontroller

`src/test/trip-save-runtime.test.tsx` bruker faktisk `AdminTrips` og `TripProvider`, med kontrollert/mocket Supabase-transport. Den tester lagring av navn/dato, to visninger av samme tur, ny montering, en annen åpen provider, ufullstendig urørt kart/Oppdag, bevaring av utkast ved bakgrunnslesing, serverfeil, feil turretur, gjenopptak ved fokus, tidssone/valuta uten koordinater, ugyldige nye kartverdier og langsom oppdatering av øvrig innhold.

- 10 nye runtime-tester bestått.
- Hele testsettet: 468 tester i 42 filer bestått.
- `npx tsc --noEmit -p tsconfig.app.json`: bestått.
- `npm run build`: bestått; eksisterende varsel om chunk over 500 kB.

Dette er klienttester med nettverksdobbel, ikke en produksjons- eller fysisk PWA-test. Port 0 sine tidligere isolerte SQL-resultater og gjenværende native samtidighetskontroller står i `PORT0_RUNBOOK.md`.

## Faktisk produksjon, kontrollert skrivebeskyttet

- Aktiv tur `8727cbc3-cbbe-48d7-a09e-d3c3074f9029` har fortsatt NULL i start_date/end_date. Datoene er ikke endret eller gjettet i denne feilrettingen.
- Produksjonen har `rpc_admin_update_trip`, med EXECUTE for authenticated. Den eldre implementasjonen bruker COALESCE for datoer/land: NULL betyr behold gammel verdi, så tømming av et allerede utfylt felt er fortsatt et separat åpent backendpunkt.
- `trips` og `trip_members` finnes ikke i noen Realtime-publication ved kontrollen. Uten publication for `trips` vil andre åpne enheter ikke få umiddelbare turhendelser. Registreringen for `trips` er allerede forberedt i Port 0-migrasjonen `20260813_port0_trip_model_authz.sql`, men er ikke kjørt i produksjon.
- Lovable-editoren viste fortsatt `da479e0` ved kontrollen, mens GitHub hadde nyere verifisert kode. Import/synk må bevare hele GitHub-etterfølgeren til `3a5f3d9`.

## Gjenstår før feilen kan lukkes hos brukeren

1. Synk den verifiserte koden til Lovable-editor/preview; ikke publiser editorens eldre versjon.
2. Følg Port 0-runbookens kontrollerte migrasjonsrekkefølge og produksjonsgodkjenning. Denne klientrettingen kjører ingen migrasjon og erstatter ikke Port 0-gatene. Avklar separat korrekt null-/tømmesemantikk for daterte turer.
3. Etter godkjent produksjonsoppsett: kontroller at `trips` er med i `supabase_realtime`, og at medlems-RLS gir korrekte mottakere. Ikke åpne brede lesepolicyer for å få sanntid til å virke.
4. I preview/staging, gjennomfør lagring som faktisk autorisert admin, kontroller serverraden, to samtidige appøkter, omstart og nettverk av/på. Verifiser at vanlig bruker/annen tur ikke kan skrive. Bruk testdata i isolert miljø; ikke finn på datoer for brukerens aktive tur.
5. Kontroller Lagre-knappen og beholdt skjema på fysisk iPhone/Android-PWA. Publiser først etter den eksisterende separate produksjonsgodkjenningen.

Status: rettet og verifisert i kode; ikke publisert, ikke lukket i produksjon. Ingen Lovable-byggekreditter er brukt i denne runden.
