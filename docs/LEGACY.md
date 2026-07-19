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

## Fjernet i step 3 (aktiv navigasjon)

Følgende funksjoner er tatt ut av aktiv navigasjon og standardflyt. Historiske
tabeller (`shot_events`, `token_ledger`, `points_ledger`, `ski_speed_records`,
`ski_daily_vertical`, `ski_track_points`, `ski_altitude_samples`,
`ski_daily_awards`, `user_frikort`) er BEVART urørt – ingen destruktive
migrasjoner.

- **Shot Roulette / tokens / frikort / poeng-topplister** – rutene `/shot`
  og `/tokens` redirecter nå til `/hjem`, MoreScreen viser ingen shot-flis, og
  MCP-manifestet eksponerer ikke lenger shot- eller poeng-verktøy.
- **Ski-fart / toppfart / dagspremier** – `useSkiTracker`, `SkiPerformanceTracker`,
  `SkiRouteMap`, `SkiUserList`, `SkiSpeedLeaderboard` er ikke lenger montert
  fra noen aktiv side; komponentfilene kan slettes trygt i et senere trinn.
- **Auto-lokasjon / auto-push** – `AppLayout` starter ikke lenger
  `useLocationTracker` eller `useAutoPush`. Deling av posisjon er strengt
  opt-in fra `/crew` (via `startSharing`) og stopper med `stopSharing`, som
  også sletter brukerens rad i `user_locations`.

## MCP-verktøy fjernet

`get_my_shot_tokens`, `get_shot_leaderboard`, `get_points_leaderboard` er
fjernet fra `src/lib/mcp/`. Beholdt: `get_my_profile`,
`list_recent_chat_messages`, `post_chat_message`.

