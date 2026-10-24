# Sosialpakke — konkret aktiveringsløp, ikke utført

Dette dokumentet er en del av den ene køen i CLOSEOUT_BACKLOG.md.
Pakken er skrevet for aktiv baseline 4638474ae0ce505740f5fee7e5f2fdb8086e62c0.
Ingen av stegene under er et bevis på at produksjonen er endret.

## Før integrasjon

1. Hent fersk aktiv Lovable HEAD, main, kunnskap og denne forberedelsesgrenen.
   Sammenlign SOCIAL_PREPARED_MANIFEST.json mot ferske aktive filhasher.
   Konflikt betyr stopp og revidert patch; ikke overskriv/force/reset.
2. Kjør `npm ci`, `npm test`, `npx tsc --noEmit -p tsconfig.app.json`,
   `npm run build` og `npm run test:social:sql`. PGlite kjører ekte PostgreSQL-
   atferd/RLS, men én forbindelse. Det er ikke native samtidighetsbevis.
3. **Bestått 24.10: 49/49 på native PostgreSQL 17.11, inkludert alle fem samtidighetsscenarier.** Se SOCIAL_NATIVE_20261024.md. Ved relevante kodeendringer, kjør `npm run test:social:native` som vanlig OS-bruker i miljø med
   `initdb`, `pg_ctl` og PostgreSQL 17. Harness oppretter og fjerner kun egen
   `/tmp/guttahutte-social-*/`-database, uten TCP og uten produksjons-URL.
   Krever alle SQL-kontroller + åtte samtidige like starter, to finaliserere,
   konkurrerende claims, femtegrense og dobbelt Headshot-forbruk.
4. Kjør Deno check av Edge-adapteren i Supabase-kompatibelt miljø. Deretter
   integrasjon med ekte test-JWT: manglende/utløpt JWT, feil tur, pending,
   banned, inactive, arkiv, fremmed svar/kvittering og ugyldig worker-secret.
   RPC-argumentet actor kommer alltid fra serververifisert JWT, aldri requestbody.
5. Revider databasejournal (inkludert MIG-HISTORY-01), tabeller, funksjoner,
   grants, triggere, cron og Edge. Denne pakken skal ikke blandes med gamle
   uappliserte august-Shot-forslag. Stopper hvis en annen shot_draws-form finnes.
   Les igjen at legacy Shot-RPC-er/tabeller er stengt; ikke reaktiver dem.

## Trinnvis serveraktivering

- Kjør den nye skjemaendringen som **én ny journalført transaksjon**, hentet
  fra `migrations-pending/20261013221627_social_v2_prepared.sql`.
  Ikke flytt/kjør hele migrations-pending. Historisk chat notification_dispatches
  og eksisterende bruker-/media-/økonomihistorikk skal være byte-/radmessig uendret.
- Verifiser RLS, service-only EXECUTE og ingen klienttilgang til secrets/outbox.
  Alle nye funksjoner er invoker med fast search_path; Edge bruker service-role
  etter autentisering og medlemskontroll. Kjør DB-advisor etter migrasjonen.
- Deploy kun `social`, først deaktivert (`SOCIAL_ENABLED=false`). Bevar gamle
  Edge-kilder til revidert opprydding, men ikke deploy/aktiver shot-draw i parallell.
- Secrets: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, korrekt HTTPS APP_URL og
  ny tilfeldig SOCIAL_WORKER_SECRET. Ingen nøkkelverdi i Git, prompt, logg eller rapport.
  OneSignal-identiteten må allerede være knyttet til godkjent bruker-ID som external_id;
  verifiser dette i isolert testoppsett før varsler anses levert.
- Vault-navn: social_worker_secret (samme verdi), social_function_url (korrekt Cloud
  functions/v1/social), social_publishable_key (prosjektets publiserbare nøkkel).
  Ikke kopier verdier fra et annet Supabase-prosjekt. Ikke eksponer dem i readback.
- Når portene er grønne, aktiver SOCIAL_ENABLED og det reviderte SQL-utkastet
  `20261014_social_activation.sql`. Det krever eksplisitt transaksjonsinnstilling
  `guttahutte.social_tests_verified=yes`; dette er en verifikasjonsport, ikke en
  påstand om at tester har kjørt. Ettsekunds social_tick finaliserer draw_at og
  tildeler lokale døgnrettigheter; tisekunders delivery-jobb tømmer outbox.
  Edge har i tillegg en uavhengig 10,2 s fastvei via waitUntil.
- Kontroller jobbresultater, leases, retryforsinkelser og provider-ID. Deaktiverte/
  arkiverte turer får ingen nye tildelinger. Push sjekker medlemskap/arkiv på nytt.

## Leveransebevis før ferdigmelding

Mål faktisk server_started_at → draw_at → finalized_at med alle klienter
lukket, også når Edge-fastveien avbrytes. Bekreft ti sekunders deadline og
mål/rapportér faktisk forsinkelse; ettsekunds cron er ikke en hard sanntidsgaranti.
En minuttcron er ikke akseptabelt som ti sekunders bevis.

Test provider-timeout/429/5xx, aksept etterfulgt av tapt DB-kvittering,
utløpt lease og gjentatte workers. Stabil UUID beholdes; manglende provider-ID
blir aldri «sendt». Pushforsøk utløper etter ett døgn, godt innen providerens
30-dagers idempotensvindu. In-app-historikk beholdes uavhengig av pushfeil.
Testmottakere må være avtalte/testidentiteter; ikke send til ekte gjeng uten avtale.

Bekreft start/resultat/svar og individuelle read/dismiss over to autoriserte
økter, riktig tur/hendelse fra lenke (også gammel historie), reconnect,
arkivlesing, ti sekunders livevisning og Headshot ved lokal midnatt/DST.
Åpne så den integrerte koden i aktiv Lovable preview og les nøkkelfiler/HEAD
igjen. GitHub, kunnskap og lokale tester alene er ikke aktiv funksjon.
Fysisk iPhone/PWA og SAVE-01 er fortsatt egne porter. Frontend publiseres kun
etter separat godkjenning, aldri som bivirkning av dette oppdraget.

## Tilbakerulling uten tap

Sett SOCIAL_ENABLED=false, stopp `guttahutte-social-tick` og
`guttahutte-social-delivery` med cron.unschedule, og fjern kun de nye
Realtime-koblingene ved behov. La schema/hendelser/kvitteringer/leases og
historisk brukerinnhold stå. Ikke åpne gammel Shot som fallback.
