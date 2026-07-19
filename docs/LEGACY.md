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

Alle gamle vær-/skredplanlagte jobber (pg_cron eller eksterne) skal deaktiveres
manuelt av admin. Ingen ny cron aktiveres i dette trinnet – hvis morgen-push
gjeninnføres, skal det være én enkelt Val Thorens/Open-Meteo-basert funksjon.
