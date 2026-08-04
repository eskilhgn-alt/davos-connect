/**
 * WeatherScreen – rask prognose fra Open-Meteo kombinert med Val Thorens'
 * offisielle fjellmålinger fra Lumiplan.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useTripWeather } from "@/hooks/useTripWeather";
import { describeWeatherCode, type TripDailyForecast } from "@/services/tripWeather";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";
import { useValThorensLive, liveScope } from "@/hooks/useValThorensLive";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  ExternalLink,
  Wind,
  Droplets,
  Snowflake,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  AlertTriangle,
  Loader2,
  ChevronRight,
  Phone,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ICONS = {
  sun: Sun,
  cloud: Cloud,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-drizzle": CloudDrizzle,
  "cloud-fog": CloudFog,
  "cloud-lightning": CloudLightning,
} as const;

function WeatherIconFor({ code, size = 20 }: { code: number | null | undefined; size?: number }) {
  const info = describeWeatherCode(code);
  const Icon = ICONS[info.icon] ?? Cloud;
  return <Icon size={size} strokeWidth={1.7} />;
}

function fmt(n: number | null | undefined, digits = 0, suffix = "") {
  if (n == null) return "–";
  return `${n.toFixed(digits)}${suffix}`;
}

function DayRow({ day }: { day: TripDailyForecast }) {
  const info = describeWeatherCode(day.weatherCode);
  const date = new Date(day.date + "T00:00:00");
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-none">
      <div className="w-14 shrink-0">
        <p className="font-heading text-xs font-semibold text-foreground uppercase leading-none">
          {format(date, "EEE", { locale: nb })}
        </p>
        <p className="text-[10px] text-muted-foreground">{format(date, "dd.MM", { locale: nb })}</p>
      </div>
      <WeatherIconFor code={day.weatherCode} />
      <p className="flex-1 text-xs text-muted-foreground truncate">{info.label}</p>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {(day.snowfallCm ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-primary">
            <Snowflake size={11} />
            {fmt(day.snowfallCm, 0, " cm")}
          </span>
        )}
        {(day.precipitationMm ?? 0) > 0 && (day.snowfallCm ?? 0) === 0 && (
          <span className="flex items-center gap-0.5">
            <Droplets size={11} />
            {fmt(day.precipitationMm, 1, " mm")}
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <Wind size={11} />
          {fmt(day.windMaxMs, 0, " m/s")}
        </span>
      </div>
      <div className="w-20 text-right font-heading text-sm font-semibold text-foreground tabular-nums">
        {day.tempMaxC != null ? `${Math.round(day.tempMaxC)}°` : "–"}
        <span className="text-muted-foreground font-normal">
          {" / "}
          {day.tempMinC != null ? `${Math.round(day.tempMinC)}°` : "–"}
        </span>
      </div>
    </div>
  );
}

export const WeatherScreen: React.FC = () => {
  const { selectedTrip } = useTrip();
  const trip = React.useMemo(() => resolveDestination(selectedTrip), [selectedTrip]);
  const { weather, loading, error, unavailable, refresh } = useTripWeather();
  const liveSupported = trip.liveProvider === "lumiplan";
  const { data: liveData, loading: liveLoading, refresh: refreshLive } = useValThorensLive(liveSupported, liveScope(selectedTrip?.id ?? null, trip.liveProvider));

  const current = weather?.current;
  const today = weather?.daily?.[0];
  const info = describeWeatherCode(current?.weatherCode ?? today?.weatherCode);
  const skiPatrol = trip.emergency
    .flatMap((group) => group.contacts)
    .find((contact) => contact.label.toLowerCase().includes("skipatrulje"));

  const updatedAt = weather?.fetchedAt ? new Date(weather.fetchedAt) : null;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Vær"
        subtitle={trip.destination ? `${trip.destination}${trip.country ? `, ${trip.country}` : ""}` : "Ingen tur valgt"}
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          <button
            onClick={() => {
              void refresh();
              void refreshLive().catch(() => undefined);
            }}
            aria-label="Oppdater vær"
            className="tap-target flex items-center justify-center text-muted-foreground"
          >
            <RefreshCw size={18} className={cn((loading || liveLoading) && "animate-spin")} />
          </button>
        }
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-4">
          {/* Hero */}
          <div className="rounded-2xl bg-muted/50 border border-border p-5">
            {unavailable ? (
              <div className="flex flex-col items-center text-center gap-2 py-4">
                <AlertTriangle className="text-muted-foreground" size={22} />
                <p className="text-sm text-muted-foreground">
                  Vær er ikke konfigurert for denne turen. Admin må legge inn koordinater i destinasjonsoppsettet.
                </p>
              </div>
            ) : loading && !weather ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : error && !weather ? (
              <div className="flex flex-col items-center text-center gap-2 py-4">
                <AlertTriangle className="text-destructive" size={22} />
                <p className="text-sm text-muted-foreground">{error}</p>
                <button
                  onClick={refresh}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Prøv igjen
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <div className="text-primary">
                  <WeatherIconFor code={current?.weatherCode ?? today?.weatherCode} size={56} />
                </div>
                <div className="flex-1">
                  <p className="font-heading text-4xl font-semibold text-foreground leading-none">
                    {current?.temperatureC != null ? `${Math.round(current.temperatureC)}°` : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{info.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Føles som {fmt(current?.apparentTemperatureC, 0, "°")}
                  </p>
                </div>
                <div className="text-right space-y-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-end gap-1">
                    <Wind size={12} />
                    <span>{fmt(current?.windSpeedMs, 0, " m/s")}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Droplets size={12} />
                    <span>{fmt(current?.precipitationMm, 1, " mm")}</span>
                  </div>
                  {(current?.snowfallCm ?? 0) > 0 && (
                    <div className="flex items-center justify-end gap-1 text-primary">
                      <Snowflake size={12} />
                      <span>{fmt(current?.snowfallCm, 0, " cm")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {updatedAt && (
              <p className="text-[10px] text-muted-foreground/70 mt-3 text-center">
                Oppdatert {format(updatedAt, "dd.MM 'kl' HH:mm", { locale: nb })} · Open-Meteo
              </p>
            )}
          </div>

          {liveData?.weather?.length ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offisielt fjellvær</h2>
                <span className="text-[10px] text-muted-foreground">{trip.destination} / Lumiplan</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {liveData.weather.slice(0, 2).map((point, index) => (
                  <div key={`${point.name}-${point.elevationM ?? index}`} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-foreground">{point.elevationM ? `${point.elevationM} moh.` : point.name}</p>
                    <p className="font-heading text-2xl font-bold text-foreground mt-2">{point.afternoonTemperature || point.morningTemperature || "–"}</p>
                    <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                      <p className="flex items-center gap-1"><Wind size={10} /> {point.wind || "–"} {point.windDirection || ""}</p>
                      {point.freshSnow && <p className="flex items-center gap-1"><Snowflake size={10} /> Nysnø {point.freshSnow}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Prognose */}
          {weather?.daily && weather.daily.length > 0 && (
            <div className="rounded-2xl bg-muted/30 border border-border px-4">
              {weather.daily.map((d) => (
                <DayRow key={d.date} day={d} />
              ))}
            </div>
          )}

          {/* Live status i appen + sikkerhetskilde */}
          <div id="sikkerhet" className="rounded-2xl border border-border p-4 space-y-3 scroll-mt-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">Snø og sikkerhet</h3>
            <p className="text-xs text-muted-foreground">
              Se live snø-, heis- og løypestatus uten å forlate appen. For skredfare utenfor preparerte løyper må Meteo-France brukes.
            </p>
            <div className="flex flex-col gap-2">
              {liveSupported && (
              <Link
                  to="/kart?vis=status"
                  className="inline-flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <span>Snø, heiser og løyper</span>
                  <ChevronRight size={14} />
              </Link>
              )}
              {trip.officialLinks.avalanche && (
                <a
                  href={trip.officialLinks.avalanche.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <span>{trip.officialLinks.avalanche.title}</span>
                  <ExternalLink size={13} />
                </a>
              )}
              {trip.officialLinks.safety && (
                <a
                  href={trip.officialLinks.safety.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <span>{trip.officialLinks.safety.title}</span>
                  <ExternalLink size={13} />
                </a>
              )}
              {skiPatrol?.href && (
                <a
                  href={skiPatrol.href}
                  className="inline-flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground"
                >
                  <span>{skiPatrol.label} · {skiPatrol.value}</span>
                  <Phone size={13} className="text-primary" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherScreen;
