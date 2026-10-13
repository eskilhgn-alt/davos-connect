# GüttaHütte — én gjeldende prosjektkontrakt

Oppdatert 14. oktober 2026. Denne filen styrer omfang og grenser.
[CLOSEOUT_BACKLOG.md](CLOSEOUT_BACKLOG.md) er eneste status-/arbeidskø.
[SOCIAL_FEATURES_20260920.md](SOCIAL_FEATURES_20260920.md) beskriver de bestilte sosiale funksjonene.
[CLOSEOUT_AUTOMATION.md](CLOSEOUT_AUTOMATION.md) styrer videreføring. Historiske dokumenter er bevis, ikke konkurrerende ordre.

## Kontinuitet og brukerkanal

Eskils nyeste beskjed i denne samtalen har forrang. Han har uttrykkelig autorisert
videre arbeid **her selv om samtale-ID ikke kan verifiseres teknisk**, og bedt om
at tidligere beslutninger samles slik at arbeidet ikke fragmenteres.
Dette opphever den tidligere tekniske stoppbetingelsen for dette arbeidet her;
det autoriserer ikke ny prosjektchat, videresending, duplisert oppgave eller
påstand om teknisk verifisert samtale-ID. Opprinnelig kanonisk ID:
`6a7c15c4-58f8-83ed-b1c9-7ae599e3f491`.
Relevante tidligere GüttaHütte-samtaler er søkt og sammenholdt med fersk kode
og kunnskap. Ikke hev at alle chatter er lest eller fysisk slått sammen.

## Produkt og beholdt omfang

- Privat generell turapp for én fast vennegjeng, alltid navnet **GüttaHütte**.
- Aktivt planlagt reisemål: Val Thorens 2027. Turdatoer er ikke fastsatt;
  nullable datoer skal aldri fylles med gjetninger. Destinasjonsdata tilhører turen.
- Flerturmodell med `trip_id`, medlemskap, IANA-tidssone og status draft/active/archived.
  Høyst én aktiv tur; aktiveringsflyten bevarer én. Draft er ikke arkiv.
- Chat inneholder meldinger, Stories (24 timer), galleri og Minner. Permanent
  lagring skjer eksplisitt med «Lagre i Minner». Bevar media, kommentarer og historikk.
- Behold Agenda/Plan, Kart, Vær/skred, Oppdag, Kamera, Deltakere, Innstillinger og Admin.
- Runder/Utlegg, Faktasjekk og Avstemninger er avviklet. Historiske data bevares låst.
  Roomies/Casino/legacy Shot med tokens/poeng/straff skal ikke reaktiveres.
- Bestilt sosialt: God stemning → felles varig varsling → Shot your shot → Headshot.
  Ingen andre nye funksjoner. Fem Shot-STARTER per person/turdag, ti sekunders
  servernedtelling, lik 1/N inklusive initiativtaker/admin, serverkrypto/commit-reveal,
  frosset deltakersnapshot, bare vinner svarer én gang. Headshot er målrettet,
  skilles fra tilfeldig trekning, men teller i mottatt-statistikk og gårsdagens leder.
- Headshot: én tilfeldig valgt ved delt gårsdagstopp, ingen lederpremie ved null;
  to ANDRE ulike tilfeldig valgte medlemmer, ingen duplikater, utløp neste lokale midnatt.
- God stemning varsler de ANDRE aktive godkjente turmedlemmene. Valgfri stedstekst;
  ingen automatisk GPS. Fem minutters spamvern er dokumentert implementeringsstandard.

## Tilgang, varsler og mobil

Godkjent aktivt medlemskap, riktig tur, banned-status og arkivets skrivebeskyttelse
håndheves i RLS/Storage/RPC/Edge/Realtime/push. Klienten avgjør ikke tilgang.
Crew/posisjoner er admin-only; vanlig bruk starter ikke sporing.
Ingen e-post, tokens, modereringsfelt eller serverhemmeligheter i medlemspresentasjon.
Sosiale mutasjoner går via autentisert Edge og atomisk database; varig outbox
har claim/lease/retry og stabil provider-idempotens. In-app-kvitteringer er
individuelle. Pushaksept hos leverandør er ikke bevis på mottak på telefon.

Alle undersider har samme fargede 48×48 venstrepil til Hjem, ingen bunnmeny
eller ekstra hussymbol. Bevar koordinert pull-to-refresh, tastatur, utkast og
scrollankere. Norsk UI, minst 44 px øvrige trykkflater, zoom beholdes.
Kamera forsøker ekte datert MP4 muted/defaultMuted/playsInline/loop/autoplay/play().
Realistisk fallback ved autoplay-/nettverksfeil; timelapse skal aldri kalles live.

## Leveranse, kostnad og slutt

Lovable-prosjekt `922d4106-51f2-4f7a-8987-7f213f3d8198`, workspace
`jSlrFxv1wGZp2TvPNAbx`, repo `eskilhgn-alt/davos-connect`, Cloud DB
`psupgftxzyoyeyuhtqgw`. Ikke bruk et annet Supabase-prosjekt.

Oktoberforbruk er registrert til 30 gratis byggekreditter. Ingen Build/Plan/Max
før 01.11.2026 uten konkret bekreftet ny gratis kvote. Deretter maks fem FAKTISK
tilgjengelige gratis per kredittdøgn på tvers av jobber; ukjent saldo er ikke fem.
Ingen kjøp, top-up eller oppgradering. Bruk gratis Git/kode/testforarbeid nå.

Nødvendig reversibelt bestilt arbeid er autorisert. Denne leveransen forbereder
kode på separat gren; den aktiverer ikke DB/Edge/cron, publiserer ikke frontend
og sender ikke testpush til gjengen. Ingen destruktiv historikksletting, force-push,
blind merge eller reset. Fremtidig aktivering krever de konkrete testportene;
frontendpublisering krever separat godkjenning.

Rapporter kontrollert start/sluttcommit, aktivt versus forberedt, tester,
faktisk kredittkostnad, åpne porter og ett neste steg. Fysisk iPhone/two-session-
bevis må komme fra faktisk test. Stopp først når hele avtalte listen er bevist
lukket, eller pause ved bare manuelle porter etter ferdig uavhengig arbeid.
