# Kostnadsfritt sosialt forarbeid — 14. oktober 2026

## Faktisk levert og hva som er aktivt

Kontrollert startcommit/main/aktiv Lovable: `4638474ae0ce505740f5fee7e5f2fdb8086e62c0`.
Ny kode er lagret på `codex/social-prepared-20261014`; det eksakte Git-objektet
på grenen er leveransecommit. Aktiv Lovable/main er ikke flyttet av denne pakken.
**0 Lovable-kreditter. Ingen Build/Plan/Max, DB-mutasjon, Edge-/cron-aktivering,
ekte push eller frontendpublisering.**

- Felles sosiale hendelser, varige individuelle in-app-varsler, cursorhistorikk,
  riktig tur/hendelse fra deep link, reconnect og ett felles Realtime-abonnement.
- God stemning med valgfritt sted, andre mottakere, serverbekreftet skjuling,
  eieravslutning, idempotent retry og dokumentert femminutters spamvern.
- Shot: ti sekunders serverdeadline, frozen snapshot, kryptografisk seedcommitment/
  reveal og rejection sampling, fem starter per person/turdag, bare vinnersvar,
  varig logg og dag-/turstatistikk med separate Headshot-tall.
- Headshot: tilfeldig tie-break ved gårsdagstopp, nullregel, to andre uten
  duplikat, IANA-midnatt, 23/25-timers DST-døgn og atomisk engangsforbruk.
- Per mottaker atomisk outbox-claim/lease, retry/Retry-After, stabil OneSignal-UUID,
  avvisning av kvittering fra tapt lease og ingen falsk sendtstatus uten provider-ID.
- Edge verifiserer JWT og utleder actor på server. Social worker krever eget
  hemmelig token. Pakken er deaktivert uten SOCIAL_ENABLED=true.
- Pending SQL og separat aktiveringskandidat er utenfor automatiske migrations.
  Gamle august-Shot-forslag er eksplisitt overstyrt, ikke kjørt/slettet.
- Gjeldende prosjektkontrakt/backlog/videreføring er samlet, tidligere versjoner
  bevart i docs/history. Septemberimporter og gamle stoppdatoer er fjernet fra køen.

## Kjørte kontroller

| Kontroll | Faktisk resultat |
| --- | --- |
| Hele Vitest-settet | **520/520 i 48 filer**, exit 0. Baseline var 501/501 i 46 filer. |
| Nye worker-/klienttester | 19 kontroller: timeout/retry/dobbeltrykk, tapt kvittering/lease, providerfeil, ingen push ved tilbakekalt tilgang, turbytte, gamle hendelser og historikk. |
| PostgreSQL-atferd/RLS i PGlite 0.5.9 | **44/44**: migrasjon to ganger, atomiske sideeffekter, egne kvitteringer, direkte RPC-/tabellangrep avvist, snapshot/proof, femgrense, svar, rettigheter, tie-break, få medlemmer, arkiv/DST, cursorpaginering, ingen offentlig EXECUTE. |
| TypeScript app | `tsc --noEmit -p tsconfig.app.json`, exit 0. |
| Vite/PWA | `npm run build`, exit 0; sw.js og Workbox generert. Eksisterende chunk-size-varsel er ikke en byggefeil. |
| Edge-typekontroll | Deno 2.9.6 check, exit 0 med lokal import-map til **samme** låste supabase-js 2.93.3-typepakke. Direkte esm.sh-import fikk nettverksfeil; fjernimport/deploy er ikke testet. |
| Native harness | Skrevet: samme 44 SQL-kontroller + fem reelle samtidighetsscenarier med separate forbindelser. **Ikke kjørt**: dette miljøet er root og nekter bytte til ordinær UID. |
| Import | SHA-256-manifest + verifiserende importhjelper. Kjørt mot ren baseline, etterkontroll og andre kjøring uten endring; konflikttest avviser før skriving. |

PGlite er ekte PostgreSQL i WASM med én forbindelse. Tester der beviser ikke
samtidig låsing, deployet cronlatens, Edge-miljøets autentisering, OneSignal-
levering, to innloggede enheter eller fysisk iPhone. Disse portene forblir åpne.

## Fersk skrivebeskyttet databasekontroll

Kilde: korrekt Lovable Cloud-prosjekt psupgftxzyoyeyuhtqgw.
Nye social_events/shot_draws/in_app_notifications mangler; gammel chat-
notification_dispatches finnes og endres ikke. De nødvendige medlems-/turfeltene
og helperfunksjonene er lest fra aktiv schema. pg_cron 1.6.4 og pg_net 0.19.5 finnes.
Alle 15 legacy Shot-RPC-er har authenticated EXECUTE=false; shot_events,
shot_event_log og shot_tokens har RLS, ingen klienttabelltilgang og ingen Realtime.
user_locations har kun admin-policy (`is_admin(auth.uid())`) for les/skriv.
Dette er målrettede metadatafunn, ikke en full ny attestering av DATA/LEG-portene.
Ingen private medlemsrader eller nøkler er kopiert til pakken.

## Trygg fremtidig import

Hent eksakt commit på forberedelsesgrenen til en separat kildemappe.
Kjør `python scripts/apply_prepared_social.py KILDE APPROT` først.
`--apply` skriver først etter at ALLE før-/etter-hasher er kontrollert og ingen
konflikt finnes. Den kjører aldri SQL, Edge-deploy, cron eller publisering.
Manifestet omfatter payload-filer, men ikke seg selv (ingen sirkulær hash).
Stopper ved avvik, nye uventede filer eller symlinker. Ingen git apply eller vedlegg kreves.
Før aktiv import må native-/integrasjonsportene i SOCIAL_ACTIVATION.md følges.

## Relevante beslutninger samlet

Siste brukermeldinger her autoriserer uavhengig gratis forarbeid og videreføring
uten teknisk conversation_id-verifisering. Relevante Personal Context-treff om
GüttaHütte fra september og 13. oktober er sammenholdt med denne trådens nyere
beskjeder og aktive repodokumenter. Det er **ikke** hevdet at alle chatter er
lest eller teknisk slått sammen. Ingen fysisk iPhone-resultat er funnet i den
innhentede konteksten. All fremtidig status peker til CLOSEOUT_BACKLOG.md.

## Primærkilder brukt i utformingen

Kontrollert 14.10.2026:
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/cron/quickstart
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://documentation.onesignal.com/reference/idempotent-notification-requests
- https://pglite.dev/docs/ (én eksklusiv forbindelse)
- https://node-postgres.com/features/transactions (én klient per transaksjon)
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://supabase.com/changelog.md (lest før implementasjon; varslet eldre TLS/CBC-endring fra 10.11 endrer ikke moderne klientkode her).

Neste: native samtidighetsbevis og kontrollert sosial integrasjon, ikke ny
implementering av denne koden. Ingen betalt Lovable-jobb før ny verifisert gratis kvote.
