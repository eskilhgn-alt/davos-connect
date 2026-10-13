> HISTORISK ØYEBLIKKSBILDE. Ikke en gjeldende arbeidsordre. Se ../PROJECT_CONTRACT.md og ../CLOSEOUT_BACKLOG.md.

# Daglig ferdigstilling — oppdatert 20. september 2026

Bruk eksisterende automasjon `6a670cc678b48191bc7868930c30c0c4`,
«Ferdigstill GüttaHütte». Reaktivert fra 21.09, daglig rundt kl. 08 Europe/Oslo.
Samme kanoniske samtale og ingen dupliserte oppgaver. Den gamle stoppdatoen
17.09 er erstattet av ny uttrykkelig brukerbestilling.

## Før hver kjøring

Les fersk Lovable HEAD/kode, prosjektkunnskap, siste jobbstatus/kostnader,
CLOSEOUT_BACKLOG.md, PROJECT_CONTRACT.md, CLEANUP_20260920.md og
SOCIAL_FEATURES_20260920.md. Hent relevant tidligere chatkontekst og nye
brukerbeskjeder. Siste beskjed har forrang; ikke stol på scratch eller gammel main.

## Utfør det avtalte

1. Importer allerede forberedt CLEAN-01A etter hash-/konfliktkontroll; ikke betal
   for å skrive samme opprydding igjen. Verifiser aktiv Lovable-kode og preview.
2. Avslutt CLEAN-01B: reell backendavvikling av Runder/Utlegg, Faktasjekk og
   Avstemninger. Bevar historiske data og konto-/mediekompatibilitet.
3. Samle alle stories, galleri, historier og tilhørende funksjoner i Chat.
4. Fullfør oppnåelig kameraretting og dokumenter eventuell ekstern videokildeport.
5. Bygg God stemning/felles varsling, Shot your shot og daglige Headshot iht.
   full spesifikasjon. Bevar 1/N, serveratomisitet, bakgrunn, RLS, daggrenser og logg.
6. Avslutt gjenværende kritiske basisflyter og samlet mobil-/tilgangskontroll.

En manuell port hindrer ikke uavhengig autorisert arbeid. Ingen valgfrie nye
funksjoner eller ombygging av noe som allerede er verifisert ferdig.

## Budsjett og levering

Maks fem faktisk tilgjengelige gratis Lovable-kreditter per kredittdøgn,
inkludert andre jobber. Respektér månedstak; ingen kjøp/top-up/oppgradering,
Plan, Max eller /goal. Metadata og lokalt forarbeid først. Gi avgrenset nyttig
Build-oppdrag med margin til lagring/kontroll; tekstbudsjett er ikke en hard cap.
Følg message_id/thread_id til nested response.status er ferdig; aldri dobbeltjobb.

Kjør relevante atferdstester, typecheck/build og samlet test ved reell risiko.
Ingen påstander om fysisk enhet, live backend eller to innloggede økter uten
faktisk bevis. Bruk isolerte tester/fakes; ingen testpush til gjengen uten avtale.

Alt nytt arbeid skal inn i aktiv Lovable og kontrolleres med read_file/HEAD/diff.
GitHub/vedlegg/kunnskap alene er ikke kodesynk. Oppdater varig arbeidsliste i
samme nyttige import. Ikke publiser frontend automatisk, slett historiske data
eller gjør kjøp. Nødvendige testede bestilte rettinger er autorisert.

## Rapport og slutt

Kort norsk status i samme samtale: start/sluttcommit, konkret levert, aktivt
versus pending, tester, faktiske kreditter eller ukjent, rest og neste handling.
Deaktiver samme oppgave når HELE avtalte listen er bevist ferdig/fjernet.
Hvis bare tilgang, ekte videokilde, fysisk test eller nødvendig manuell handling
gjenstår etter selvstendig arbeid, pause med konkret restliste; kall det ikke ferdig.
Tom dagskvote betyr fortsett neste planlagte dag, ikke en ny oppgave.

## Status 3. oktober 2026
Forberedt leveranse 4c442819 er importert i aktiv Lovable (492/492, typecheck, PWA-build). Neste i rekkefølgen: CLEAN-01B → CHAT-MEDIA-01 → kamera fysisk bevis → VIBE → Shot → Headshot → sluttkontroll.

## Status 06.10.2026
CLEAN-01B ferdig og verifisert (DB-migrasjon 20261006062802 + tre Edge-funksjoner fjernet). Neste i køen: CHAT-MEDIA-01.

- 08.10: CHAT-MEDIA-01 backend aktivert og lese-verifisert; lagreknapper levert. Neste jobb: Chat-paneler, redirects, Mer/Hjem-opprydding (se backlog).

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
