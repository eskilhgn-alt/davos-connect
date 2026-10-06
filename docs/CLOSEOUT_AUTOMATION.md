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
