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
  galleri, plan/agenda, avstemninger, Shot og utlegg.
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

- Maks fire hovedfaner: **Hjem**, **Chat**, **Kart**, **Mer**.
- Hjem laster kritisk innhold først (tur/dato, vær/skred, neste plan, chatstatus);
  resten progressivt.
- Kart samler løypekart, live status og turdata.
- Mer samler Plan, Minner, Utlegg, Shot, deltakere, innstillinger og Admin.
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

Chat, Minner/galleri, Stories (24t, eksplisitt «Lagre i Minner»), Plan/agenda,
Avstemninger, Utlegg/runder, Vær inkl. skred, Kart/live status, Webkameraer,
Deltakere, Innstillinger, Admin og Shot v2.

## Produksjonsgrenser

- Ingen automatisk publisering av frontend.
- Ingen produksjonsmigrasjoner, Edge-deploy eller endring av produksjonsdata,
  historikk, secrets eller innstillinger uten eksplisitt godkjenning.
- Nye migrasjoner er additive, idempotente og bakoverkompatible; de backfiller
  eksisterende data og sletter aldri brukerinnhold automatisk.
- Skill alltid mellom produksjon, publisert frontend, siste kode/preview og
  pending migrasjoner. Grønne enhetstester er ikke produksjonsbevis.

## Språk og UI

Norsk, kort og vennlig. Minimum 44 px trykkflater, zoom aldri deaktivert, og
tydelige loading-/error-/empty-/stale-states. Mobil/PWA på iPhone er primærflaten.
