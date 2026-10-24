# GüttaHütte — samlet gjeldende arbeidsliste

Oppdatert 24. oktober 2026. Denne tabellen er eneste gjeldende kø.
Gamle tabeller/importordre i `history/` og daterte rapporter er ikke nye oppdrag.

## Kontrollert utgangspunkt

Aktiv Lovable og GitHub main: **4638474ae0ce505740f5fee7e5f2fdb8086e62c0**, preview ready.
Det er dokumentkvitteringen etter SYNC-02-merge `54b00862`; aktiv appkode er
fortsatt den testede `3770b9f` fra 10.10. Baseline: 501/501, tsc og PWA-build.
Ny sosial kode ligger kun på **codex/social-prepared-20261014**, basert på 4638474.
Commit og filhasher identifiseres av grenens Git-objekt og SOCIAL_PREPARED_MANIFEST.json.
Denne runden: **0 Lovable-kreditter**, ingen DB-/Edge-/cron-/push-/publisering.

| ID | Status og bevis | Eksakt gjenstående handling |
| --- | --- | --- |
| SYNC-02 | Ferdig i Git/Lovable. Begge historikker bevart; 14 main-unike commits/137 filbaner revidert. `SYNC_20261013.md`. | Ingen ny merge av gamle grener; visuelt varselkort ikke inspisert. |
| CLEAN-01A/B | Aktiv klient 03.10; backend 06.10, 23/23 isolerte kontroller, uendrede datahasher og tre gamle Edge-funksjoner fjernet. | Ikke importer septemberpakker igjen. |
| CHAT-MEDIA-01 | Aktiv backend 08.10, 26/26 + parallell lagring; klient 10.10, 501/501 totalt. Stories/Minner i Chat, redirects, eksplisitt lagring, ingen remount. | Fysisk tastatur/fanebytte/utkast gjenstår; ingen ny implementering uten konkret feil. |
| CAM-01/02 | Én spiller og ekte daterte MP4-timelapses med native autoplay aktivt. | Fysisk iPhone ved åpning/bytte/gjenåpning. Ikke kall opptak live. |
| VIBE-01 | Kode og isolerte SQL-/klient-/arbeiderkontroller forberedt: grønn knapp, sted, andre mottakere, kvitteringer, historikk. | Native samtidighet bestått 24.10 (49/49). Gjenstår samlet backend/Edge/preview-integrasjon etter SOCIAL_ACTIVATION.md. |
| SHOT-02 | Forberedt: server 10 s, frosset snapshot, commit-reveal/rejection sampling, atomisk femgrense, vinnersvar og statistikk. | Samme aktivering; faktisk serverfinalisering uten klient og målt tidsforsinkelse mangler. |
| SHOT-03 | Forberedt: gårsdagstopp/tie-break, to andre uten duplikat, IANA-midnatt/DST, atomisk rettighet og svar. | Native samtidig forbruk bestått 24.10. Gjenstår integrert serverjobb/varsling ved døgnskifte. |
| SOCIAL-QA | Nye tabeller og RPC-er testet i PGlite; ny worker og klient testet. Se SOCIAL_PREPARATION_20261014.md. | Native PostgreSQL 17.11: 49/49 bestått, inkludert fem parallelle scenarier (24.10). Deployet cron, pushmottak og fysisk enhet gjenstår. |
| SAVE-01 / MOB-01 | Turlagring/Realtime aktivert 17.09; native SQL/samtidighet dokumentert. | Faktisk lagring/gjenåpning på to autoriserte enheter, fysisk PWA, pil/pull-to-refresh. Ingen nye testresultater fra Eskil i innhentet kontekst. |
| PORT0-01–04 | Trip-save-pakken har native bevis 17.09; eldre Port0-dokumenter inneholder uavklarte historiske statuser. | Sammenhold med aktiv migrasjonshistorikk; ikke kjør gamle pending-filer om igjen. |
| DATA-01/02 | Tur-scoping og posisjonsklient har testbevis; user_locations har admin-only RLS i fersk lesekontroll 14.10; full tilgangsmatrise er ikke ferdig attestert. | Behold samlet negativ matrise for tur/media/posisjoner, særlig admin-only og arkiv. |
| LEG-01 | Gamle Shot-tabeller har RLS, ingen klienttilgang/Realtime; alle 15 legacy Shot-RPC-er har authenticated EXECUTE=false (lesekontroll 14.10). | Øvrig Roomies/Casino/Davos-legacy fortsatt egen auditport; ikke anta hele porten lukket av Shot-kontrollen. |
| MIG-HISTORY-01 | Historisk migrasjonsduplikat er dokumentert i SYNC_20261013.md, uendret. | Avklar journal mot aktiv database før noen migrering. Ikke slett/replay automatisk. |
| FLOW-01 | Beholdte basisflyter har delvis klientdekning. | Samlet innlogget funksjons-/tilgangs-/mobilkontroll etter sosial integrasjon. |
| RELEASE / STOP-01 | Ikke ferdig. Samme automasjon er pauset; frontend ikke republisert. | Klargjør separat publiseringsgodkjenning først når hele listen er bevist lukket. |

## Neste prioritet

**Native PostgreSQL-porten er bestått. Fortsett med autentisert Edge-/serverjobb-/pushintegrasjon etter SOCIAL_ACTIVATION.md når gratis aktivering er tilgjengelig.** Ikke skriv
samme sosiale kode på nytt. Konkrete nye iPhone-feil kan tas før aktivering.
Kredittkrevende jobb kan tidligst forsøkes 01.11 med verifisert tilgjengelig kvote.
Gratis arbeid kan fortsette uten å utløse ny byggejobb.

Historiske fullstendige bevis er bevart i `history/20261013_CLOSEOUT_BACKLOG.md`.

## Kontroll 24.10.2026

Lovable-forbindelsen virker. Aktiv HEAD er fortsatt 4638474; ingen Build eller produksjonsendring. Native bevis og CI ligger på codex/social-native-20261024, avledet direkte fra bcb8439. Se SOCIAL_NATIVE_20261024.md. Denne grenen erstatter forberedelsesgrenen som videreføringskilde. Manifestkontroll mot baseline: 38/38 filer før dokumentoppdateringen. Lovable-kostnad 0.
