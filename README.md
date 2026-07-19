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
- **Mer** – agenda, roomies, avstemninger, runder, galleri, historier,
  Gütta-oversikt, innstillinger, admin. En lavt prioritert seksjon "Fest og
  spill" samler frivillige tilleggsfunksjoner (faktasjekker).

## Vær og skred

- Vær kjører klient-side mot **Open-Meteo** (`src/services/tripWeather.ts`),
  sentrert på `ACTIVE_TRIP.center` og `ACTIVE_TRIP.timezone`. Ingen API-nøkkel.
- Offisielt fjellvær og skredvarsel lenker eksternt til **Meteo-France** via
  `ACTIVE_TRIP.officialLinks.weather`. Vi presenterer ikke oppdiktet faregrad.
- Webkameraer og løypekart lenker til `valthorens.com`.

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
  `list_recent_chat_messages`, `post_chat_message`. Shot-/token-/poeng-verktøy
  er fjernet.

## Historikk

Historiske data (chat, bilder, shot-hendelser, ski-målinger, poeng, tokens)
er bevart urørt. Se `docs/LEGACY.md` for hva som er tatt ut av aktiv bruk.

## Utvikling

```
bun install
bun run dev
bunx vitest run
```
