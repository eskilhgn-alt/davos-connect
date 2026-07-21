# Legacy edge functions and cron jobs

## Removed in Val Thorens step 2

The following edge functions were Davos-/Sveits-spesifikke og er avviklet.
De skal ikke lenger kalles fra app-kode, produksjon eller cron-jobber.

- `weather-yr` – Yr-basert vær for Davos.
- `weather-meteoswiss` – MeteoSwiss-integrasjon.
- `weather-engine-get`, `weather-engine-refresh`, `weather-engine-v2`, `weather-engine-v3` – parallelle værmotorer (v1/v2/v3).
- `weather-ai-summary` – LLM-oppsummering på toppen av Davos-værkilder.
- `weather-morning-push` – morgen-push basert på Davos-vær.
- `avalanche-bulletin` – SLF/WSL-skredhenting.
- `avalanche-push` – push av sveitsiske skredvarsler.
- `webcam-proxy` – bildeproxy for Feratel-webkameraer i Davos.

Aktiv vær-flyt kjører nå klient-side mot Open-Meteo (se
`src/services/tripWeather.ts` og `src/hooks/useTripWeather.ts`), sentrert på
`ACTIVE_TRIP.center` / `ACTIVE_TRIP.timezone`. Offisielt fjellvær og
skredvarsel går til Meteo-France via `ACTIVE_TRIP.officialLinks.weather`.

## Cron

Den eneste gjenværende gamle jobben `weather-morning-push-0700` er nå
deaktivert (`active=false`) og trigger ingenting. Ingen ny cron aktiveres i
dette trinnet – hvis morgen-push gjeninnføres senere, skal det være én
enkelt Val Thorens/Open-Meteo-basert funksjon.

## Arkivert i generisk app-opprydding

Følgende funksjoner er tatt ut av aktiv navigasjon og klientkoden. Historiske
tabeller er bevart for sporbarhet, men migrasjonen
`20260720123000_archive_retired_gamification.sql` har fjernet all direkte
tilgang for `public`, `anon` og `authenticated`. Tilhørende RPC-er er også
tilbakekalt. Arkivet kan derfor bare håndteres server-side med eksplisitt
service-tilgang.

- **Shot Roulette / tokens / frikort / poeng-topplister** – rutene `/shot`
  og `/tokens` redirecter nå til `/hjem`, MoreScreen viser ingen shot-flis, og
  MCP-manifestet eksponerer ikke lenger shot- eller poeng-verktøy.
- **Ski-fart / toppfart / dagspremier** – tracker-hooks, sider og komponenter er
  slettet fra klientkoden. De kan senere bygges på nytt som en egen,
  destinasjonsuavhengig modul med tydelig samtykke og batteribudsjett.
- **Auto-lokasjon / auto-push** – `AppLayout` starter ikke lenger
  `useLocationTracker` eller `useAutoPush`. Deling av posisjon er strengt
  opt-in fra `/crew` (via `startSharing`) og stopper med `stopSharing`, som
  også sletter brukerens rad i `user_locations`.

## MCP-verktøy fjernet

`get_my_shot_tokens`, `get_shot_leaderboard`, `get_points_leaderboard` er
fjernet fra `src/lib/mcp/`. Beholdt: `get_my_profile`,
`list_recent_chat_messages`, `post_chat_message`.

## Ny brukerflyt

`20260720124000_generic_new_user_flow.sql` erstatter den gamle triggeren som
ga nye brukere tokens/frikort og kunne tildele admin fra en hardkodet e-post.
Nyregistrering oppretter nå kun profil og standardrolle. Tilgang godkjennes
eksplisitt av en eksisterende admin.
