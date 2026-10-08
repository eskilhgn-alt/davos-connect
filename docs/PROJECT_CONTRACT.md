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

- CHAT-MEDIA-01 (08.10): Automatisk kopiering til Minner er avslått i databasen; permanent lagring skjer kun via rpc_save_story_to_minner / rpc_save_attachment_to_minner. Panelintegrasjon i Chat gjenstår.
