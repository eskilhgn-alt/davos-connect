# GüttaHütte

Mobile-first PWA for private turer med et crew. Aktiv tur er **Val Thorens
2027** (februar-datoer ikke bekreftet). All destinasjonslogikk styres fra én
sentral konfig i `src/config/trip.ts` (`ACTIVE_TRIP`) – bytt destinasjon der,
ikke i UI.

## Navigasjon (fire faner)

- **Hjem** – aktiv tur, nedtelling, neste aktivitet, kompakt vær og
  liveforhold.
- **Chat** – gruppechat med bilder og realtime.
- **Kart** – offisielt Val Thorens-løypekart og (via egen inngang) frivillig
  crew-posisjon på `/crew`.
- **Mer** – agenda, avstemninger, runder, galleri, historier,
  Gütta-oversikt, innstillinger, admin. En lavt prioritert seksjon "Fest og
  spill" samler frivillige tilleggsfunksjoner. Faktasjekk bruker GPT-5.6 Sol
  med ekstra høy resonnering, serverstyrt historikk og aktivt nettsøk.

## Vær og skred

- Vær kjører klient-side mot **Open-Meteo** (`src/services/tripWeather.ts`),
  sentrert på `ACTIVE_TRIP.center` og `ACTIVE_TRIP.timezone`. Ingen API-nøkkel.
- Offisielt fjellvær og skredvarsel lenker eksternt til **Meteo-France** via
  `ACTIVE_TRIP.officialLinks.weather`. Vi presenterer ikke oppdiktet faregrad.
- Webkameraer vises som direktebilder. Det offisielle interaktive løypekartet
  åpnes inne i appen, med live heis- og løypestatus i samme skjerm.

## Posisjon (crew)

Deling av posisjon er **strengt frivillig**. Ingen global layout starter GPS.
Fra `/crew` slår brukeren delingen på/av eksplisitt; når den slås av slettes
egen rad i `user_locations` og andre klienter skjuler foreldede posisjoner
(> 10 min). iOS PWA kan ikke garantere ekte bakgrunnssporing – det påstår vi
heller ikke.

## Auth, backend og MCP

- Lovable Cloud (Supabase) for auth, database, storage, edge functions.
- RLS på alle tabeller. Klientsidig login-throttle er en UX-hjelp, ikke en
  sikkerhetskontroll – reell begrensning kommer fra Supabase Auth.
- MCP-serveren (`src/lib/mcp/`) eksponerer nå: `get_my_profile`,
  `list_recent_chat_messages`, `post_chat_message`. Verktøy for den gamle
  gamification-modulen er fjernet.

## Historikk

Historiske data fra de utgåtte spill- og skimodulene er bevart, men arkivert:
vanlige brukere og klientappen har ikke lenger tabell- eller RPC-tilgang. Se
`docs/LEGACY.md` for detaljer.

## Utvikling

```sh
npm install
npm run dev
npm test
```
