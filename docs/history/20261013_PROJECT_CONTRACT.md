> HISTORISK ØYEBLIKKSBILDE. Ikke en gjeldende arbeidsordre. Se ../PROJECT_CONTRACT.md og ../CLOSEOUT_BACKLOG.md.

# GüttaHütte — prosjektkontrakt

Denne filen er den varige, generelle kontrakten for appen. Den er ikke en
statusrapport. Status hører hjemme i `docs/CLOSEOUT_BACKLOG.md`.

## Produkt

- Privat, generell turapp for én fast vennegjeng. Navnet er alltid **GüttaHütte**.
- Ikke en destinasjonsapp. Ingen Davos-/Sveits-spesifikk logikk skal være aktiv.
- Aktiv planlagt tur er **Val Thorens 2027**. **Datoene er ikke fastsatt og skal
  aldri gjettes.** `start_date` / `end_date` forblir nullable.

## Turmodell

- Ekte flerturarkitektur: `trips`, `trip_members` og `trip_id` på chat, stories,
  medier i Chat, plan/agenda og sosiale hendelser/Shot.
- Statusmodell: `draft` | `active` | `archived`.
  - Høyst én `active` tur (partial unique index), og aktiveringsflyten må bevare
    at det finnes nøyaktig én.
  - `draft` er redigerbar og skal aldri presenteres som arkiv.
  - `archived` er lesbar, men skrivebeskyttet for alle bruker- og serverbaner.
- Admin kan opprette, velge, redigere, datofeste og arkivere turer, samt
  administrere turmedlemmer og destinasjonstilbydere.
- Hver tur eier sin egen redigerbare destinasjonskonfigurasjon: destinasjon,
  land, tidssone, valuta, koordinater, kart, vær, skred, live status, webkameraer,
  offisielle lenker og nødkontakter. Val Thorens = Frankrike / Europe/Paris / EUR.

## Informasjonsarkitektur

- Ingen bunnmeny. Hjem samler flisene; alle app-undersider bruker samme
  tydelige pil direkte til Hjem i AppHeader (brukervalg 20. september).
- Hjem laster kritisk innhold først (tur/dato, vær/skred, neste plan, chatstatus);
  resten progressivt.
- Kart samler løypekart, live status og turdata.
- Mer samler beholdte funksjoner. Galleri, Stories/story-linjer og Minner skal
  samles inne i Chat. Separate mediefliser/-sider fjernes etter verifisert flytting.
- Crew/posisjonskart er **kun for admin**. Vanlige brukere ser ingen Crew-rute og
  får ingen posisjonssporing startet.

## Sikkerhet (server-side, ikke React)

- Supabase Auth e-postbekreftelse er adskilt fra medlemsstatus:
  `pending` / `approved` / `banned`.
- Godkjent, aktivt medlemskap, riktig tur og arkivgrense håndheves i RLS,
  Storage-policyer, RPC-er og Edge Functions. Klienten er bekvemmelighet.
- Brukere kan aldri endre egne admin-, godkjennings- eller banfelt.
- Kun en trygg medlemsvisning eksponeres — uten e-post, tokens og
  modereringsmetadata.
- Hemmeligheter og service role ligger aldri i klient eller delt SQL.

## Beholdte basisflyter

Chat med Minner/galleri og Stories (24t, eksplisitt «Lagre i Minner»),
Plan/agenda, Vær inkl. skred, Kart/live status, Webkameraer, Deltakere,
Innstillinger, Admin og Shot v2. Runder/Utlegg, Faktasjekk og Avstemninger
skal fjernes helt fra aktiv kode/backend, ikke bare fra navigasjonen.
Historisk brukerinnhold bevares. Se `CLEANUP_20260920.md`.

Ny bestilling 20. september autoriserer daglig videreføring av den avgrensede
listen til den er verifisert ferdig, med selvstopp og maks fem gratis kreditter
per kredittdøgn. Les fersk kode, kunnskap og relevant tidligere chatkontekst
før hver runde. Bestillingen utvider med God stemning og Shot your shot med
Headshot. Se `SOCIAL_FEATURES_20260920.md` for full flyt, rettferdighet,
varslinger, dagsgrenser og verifikasjon. Legacy Shot/tokens gjenåpnes ikke.

## Produksjonsgrenser

- Ingen automatisk publisering av frontend.
- Nødvendige testede rettinger/avvikling for bestilte funksjoner utføres innen
  brukerens autorisasjon. Ingen destruktiv sletting av historikk eller
  produksjonsendringer utenfor oppdraget. Fullfør reversibelt forarbeid før
  eventuell konkret sluttgodkjenning.
- Nye migrasjoner er additive, idempotente og bakoverkompatible; de backfiller
  eksisterende data og sletter aldri brukerinnhold automatisk.
- Skill alltid mellom produksjon, publisert frontend, siste kode/preview og
  pending migrasjoner. Grønne enhetstester er ikke produksjonsbevis.

## Språk og UI

Norsk, kort og vennlig. Minimum 44 px trykkflater, zoom aldri deaktivert, og
tydelige loading-/error-/empty-/stale-states. Mobil/PWA på iPhone er primærflaten.

## Oppdatering 3. oktober 2026
Runder/Utlegg, Faktasjekk og Avstemninger er fjernet fra aktiv klient (CLEAN-01A) og er ikke lenger beholdte basisflyter. Historiske data bevares; backendavvikling (CLEAN-01B) krever egen testet leveranse.

## CLEAN-01 status 06.10.2026
CLEAN-01A (klient) og CLEAN-01B (database + Edge) er ferdige. Utgåtte tabeller beholder all historikk, kun lesbar for service_role/postgres. round-receipts-bucket og objekt er bevart, men låst.

- CHAT-MEDIA-01 (08.10): Automatisk kopiering til Minner er avslått i databasen; permanent lagring skjer kun via rpc_save_story_to_minner / rpc_save_attachment_to_minner. Panelintegrasjon og klienttester ble fullført 10.10 i 3770b9f; fysisk iPhone-bevis gjenstår.

## Status 10.10.2026 — CHAT-MEDIA-01 klient
Start 63b2d2578a40acc359a1eb9a2a5fcd1eb85372f0. Chatlag (MessageList + Composer) forblir montert men er hidden + inert + aria-hidden mens Stories/Minner er åpent; fokus slippes (tastatur lukkes); arkivbanner skjules over panel. MoreScreen-kommentar rettet. Ny React-test src/test/chat-media-panels-ui.test.tsx (ingen remount, draft beholdt, inert, arkiv, story-deeplink). Full Vitest 501/501 (46 filer), tsc --noEmit exit 0, npm run build exit 0 med dist/sw.js. Aktiv i preview, ikke publisert. Ingen DB/Edge/push. CHAT-MEDIA-01 klient/test lukket; gjenstår fysisk iPhone-tastatur/autoplay og SAVE-01 på to autoriserte enheter. Neste: SAVE-01 fysisk → kamera → VIBE → Shot → Headshot.

## Kontrollpunkt 13.10.2026 — SYNC-02
- Start aktiv Lovable: `3770b9f57592fd94ceac5c45bc76e273f84093b1`; gammel main: `f69121e77565f9a010454588b7eeb656282592e3`.
- Alle 14 main-unike commits og 137 berørte filbaner revidert. Se `SYNC_20261013.md` og maskinlesbart blob-bevis. Merge bevarer begge historikker og dagens app-/backendfiler byte-identisk. Kun dokumenter endres.
- Verifisert merge/sluttcommit: `54b0086238c0daa4e38b04691d03480fc0dadf6f`. GitHub main og aktiv Lovable HEAD er identiske; preview ready. Aktiv readback av audit, App, Chat og kamera er byte-identisk. Begge gamle historikker er bevart; GitHub-sammenligning mot gammel Lovable er ahead 15 / behind 0, ikke diverged. Det visuelle varselkortet er ikke inspisert.
- 0 Lovable-byggekreditter. Oktoberforbruk er 30; ingen Build/Plan/Max før 01.11.2026 uten bekreftet ny gratis kvote. Ingen DB-/Edge-/push-/publiseringshandling.
- CLEAN-01 og CHAT-MEDIA-01 klient/test skal ikke gjøres om. Fysisk iPhone (tastatur/fanebytte/utkast, kamera, pil/pull-to-refresh) og SAVE-01 på to autoriserte enheter venter Eskils resultater.
- Neste prioritet: konkrete iPhone-funn hvis Eskil har levert dem; ellers gratis VIBE/outbox-forarbeid, så SHOT-02 → SHOT-03 → sluttkontroll og separat publiseringsgodkjenning. Historisk migrasjonsduplikat er separat dokumentert MIG-HISTORY-01, ikke endret/deployet i synkreparasjonen.

Verifikasjon 13.10: `npm test` 501/501 i 46 filer (exit 0), `tsc --noEmit -p tsconfig.app.json` exit 0, `npm run build` exit 0; `dist/sw.js` og Workbox generert. Ingen app-/backend-/låsfil er endret mot aktiv 3770b9f.

Etterkontroll 13.10: GitHub main og aktiv Lovable bekreftet på merge `54b0086238c0daa4e38b04691d03480fc0dadf6f`, preview ready. Nye auditfiler er aktivt lest tilbake. GitHub- og Lovable-synk er verifisert; selve UI-varselet er ikke visuelt kontrollert. Denne siste dokumentkvitteringen endrer ingen app-/backendfil.
