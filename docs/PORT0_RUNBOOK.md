# Port 0 — turmodell, tilgang og migrasjon

Status 14. september 2026: **Kode og isolerte SQL-/klienttester verifisert; produksjonssetting og native samtidighetsprøve gjenstår. Port 0 er ikke lukket.**

Ingen produksjonsdata, Edge Functions, secrets eller publisert frontend er endret i denne runden. Arbeidet bygger på Lovable-commit `da479e0`, som igjen bygger på `26517ce`. Produksjon er ikke kontrollert på nytt i denne runden.

## Ferdigstilt i kode

- Arkivering tar samme transaksjonslås som aktivering før radlåsen. Aktiv tur avvises; draft arkiveres én gang; allerede arkivert tur returneres uendret uten UPDATE eller ny audit. Autorisasjon kontrolleres etter låsen.
- Oppdatering og medlems-RPC-ene bruker samme lås, slik at arkivering, aktivering og siste-admin-kontrollen serialiseres.
- Direkte medlemsmutasjoner blokkeres av restrictive RLS-policyer. Klienten må bruke medlems-RPC-ene og kan ikke omgå siste-admin-kontrollen.
- Posisjons-UPDATE kontrollerer både gammel og ny rad. Legacy-/arkivrader kan ikke flyttes til en aktiv tur for å omgå skrivebeskyttelsen. Lesing krever godkjent bruker og riktig turtilgang; en godkjent eier kan lese egen legacy-rad.
- PK-inspeksjonen konverterer `pg_attribute.attname` til `text`, slik at migrasjonen ikke stopper på sammenligning av `name[]` og `text[]`.
- Utkast, aktiv og arkivert tur har riktige adminhandlinger. Ukjent status gir ikke aktivering, og en direktelenke åpner ikke arkivert tur for redigering.
- Posisjonsvisningen forkaster gamle svar ved turbytte, reparerer slettinger ved refetch og avslutter lasting ved feil. Nettverksfeil tolkes ikke som en autoritativ tom liste; siste kjente rader beholdes med vanlig stale-filter.

## Verifisert

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 41 testfiler, 458 tester bestått, inkludert 9 nye klienttester |
| `npx tsc --noEmit -p tsconfig.app.json` | Bestått |
| `npm run build` | Bestått; eksisterende varsel om JS-chunk over 500 kB |
| `bash -n supabase/tests/port0/run.sh` | Bestått syntakskontroll |
| `check-sql.mjs` med PGlite 0.5.8 / PostgreSQL 18.3 | Fixture, alle tre migrasjoner to ganger, stabile legacy-UUID-er, behavior.sql og security.sql bestått |

SQL-prøven kjører de faktiske pending-migrasjonene og tilgangsreglene i en isolert Postgres-motor. Den er ikke en strengtest, men **erstatter ikke** native PostgreSQL 17, flere samtidige sesjoner eller Supabase-integrasjon. Bare psql-direktivet for ON_ERROR_STOP fjernes; SQL-feil stopper kjøringen.

Reproduser den valgfrie SQL-prøven uten å endre prosjektavhengigheter:

```bash
npm install --prefix /tmp/guttahutte-sql-check --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
PORT0_PGLITE_MODULE=/tmp/guttahutte-sql-check/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/port0/check-sql.mjs
```

Native kontroll i et miljø med `initdb`, `pg_ctl`, `psql` og en tillatt ikke-root-bruker (Lovable-skriptet støtter uid 1000):

```bash
bash supabase/tests/port0/run.sh
```

Skriptet bruker unikt midlertidig område, lokal socket og ingen TCP. Det kjører to aktiveringer i separate authenticated-sesjoner, holder låsen inne i transaksjonene og sjekker exitkode for **begge** prosesser. Deretter kreves nøyaktig én aktiv tur. Dette er skrevet og syntakskontrollert, men native kjøring kunne ikke utføres her fordi miljøet avviser chown/bytte til uid 1000 (exit 1 før databasestart).

## Manuell migrasjonsrekkefølge

Siste kode/preview bruker målskjemaet i `targetSchema.ts`; genererte `types.ts` beskriver eldre produksjon. **Ikke publiser preview mot gammel database.** Det håndskrevne typeoverlegget er ikke genererte typer.

Etter produksjonskontroll, backup og separat produksjonsgodkjenning:

1. Kjør `20260813_port0_trip_model_authz.sql`.
2. Kjør `20260814_port0b_trip_status_draft.sql`, og fullfør transaksjonen.
3. Kjør `20260815_port0c_trip_rpc_hardening.sql` i en ny transaksjon.
4. Regenerer database-typene fra faktisk skjema og fjern målskjema-overlegget.
5. Kontroller admin/member/pending/banned, turbytte, posisjoner og arkiv i staging/preview før frontend eventuelt publiseres.

Rekkefølgen er obligatorisk. Ny enum-verdi kan ikke brukes før transaksjonen som la den til er fullført. Den partielle unike indeksen gir **høyst én** aktiv tur; aktiverings-RPC-en skal bevare nøyaktig én når en aktiv tur finnes. Ukjente turdatoer forblir NULL og må aldri fylles med gjetninger.

Preflight må bekrefte aktuell migrasjonshistorikk, tabellrettigheter/RLS, eventuelle innkommende fremmednøkler og datavolum. UUID-kolonnen gir hver eksisterende posisjonsrad en ID: dette berører rader, men sletter ikke data. Andre migrasjonsrunde skal bevare ID-er og øvrige posisjonsverdier.

Ved feil: stans videre publisering, behold data og bruk en kontrollert fremoverretting. Ikke fjern enum-verdier, UUID-kolonnen eller historikk for å etterligne rollback. En eldre klient kan være inkompatibel med ny sammensatt posisjonsnøkkel; vurder klient- og databaseskjema samlet før tilbakerulling.

## Gjenstår før Port 0 kan lukkes

- Native PostgreSQL 17-harness, reell parallell aktivering og samtidige medlemsendringer må kjøres; PGlite beviser ikke venting/deadlocks.
- Supabase advisors og kontroll mot faktisk RLS/Storage/Edge-oppsett.
- Reell iPhone/Android-PWA-test, inkludert gjenoppkobling, GPS og turbytte.
- Produksjonskontroll, manuell migrasjon og eventuell publisering.

Shot v2 forblir separat og pending. Etter Port 0 kommer eventuelt `20260810_shot_draws.sql` og deretter `20260811_shot_background_sweep.sql`. Cron, pg_net, Vault, push-leases og bakgrunnsfinalisering er ikke kjørt av denne SQL-prøven. Se `docs/SHOT_RUNBOOK.md`; ikke bruk klienttestene som bevis for produksjonens Shot-bakgrunn eller push.
