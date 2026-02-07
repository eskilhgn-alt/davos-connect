/**
 * WeatherScreen — Dual-source (Yr + MeteoSwiss) with mountain cards + AI summary
 * Minimalist, mobile-first — supports GPS-based location
 */

import * as React from "react";
import { AppHeader } from "@/components/layout";
import { BackButton } from "@/components/layout/BackButton";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosSegmented, type SegmentOption } from "@/components/ui/davos-segmented";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MOUNTAIN_AREAS } from "@/config/locations";
import {
  getDualWeather,
  clearDualWeatherCache,
  getWeatherIcon,
  getWeatherDescription,
  type FullWeatherData,
  type SourceForecast,
  type WeatherDaily,
} from "@/services/weather-dual.service";
import { useWeatherAiSummary } from "@/hooks/useWeatherAiSummary";
import { useGeolocation } from "@/hooks/useGeolocation";
import { RefreshCw, Mountain, Snowflake, Droplets, Wind, MapPin, Navigation, Sparkles, Sun, CloudSun, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type SourceTab = "yr" | "meteoswiss";

const SOURCE_OPTIONS: SegmentOption[] = [
  { value: "yr", label: "Yr" },
  { value: "meteoswiss", label: "MeteoSwiss" },
];

// Day name helper
function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const d = new Date(dateStr);
  return d.toLocaleDateString("no-NO", { weekday: "short" }).replace(".", "");
}

const WeatherScreen: React.FC = () => {
  const geo = useGeolocation();
  const { summary: aiSummary, loading: aiLoading } = useWeatherAiSummary(
    geo.position ? { lat: geo.position.lat, lon: geo.position.lon } : undefined
  );
  const [data, setData] = React.useState<FullWeatherData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<SourceTab>("yr");

  const load = React.useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) clearDualWeatherCache();
      const customLoc = geo.position ? { lat: geo.position.lat, lon: geo.position.lon } : undefined;
      const result = await getDualWeather(force, customLoc);
      setData(result);
    } catch (err) {
      console.error("Weather load failed:", err);
      setError("Kunne ikke laste værdata.");
    } finally {
      setLoading(false);
    }
  }, [geo.position]);

  React.useEffect(() => { load(); }, [load]);

  const getForecast = (d: FullWeatherData | null): SourceForecast | null => {
    if (!d) return null;
    return source === "yr" ? d.davos.yr : d.davos.meteoswiss;
  };

  const forecast = getForecast(data);
  const today = forecast?.daily?.[0] || null;

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Vær"
        subtitle="Davos Klosters"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          loading ? <RefreshCw className="h-5 w-5 animate-spin text-primary-foreground/70" /> : null
        }
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="pb-6">
          {/* Source toggle */}
          <div className="px-4 pt-4 pb-2 space-y-2">
            <DavosSegmented
              options={SOURCE_OPTIONS}
              value={source}
              onChange={(v) => setSource(v as SourceTab)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => geo.disable()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  !geo.enabled
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                <MapPin size={13} />
                Davos
              </button>
              <button
                onClick={() => geo.request()}
                disabled={geo.loading}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  geo.enabled
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                <Navigation size={13} className={cn(geo.loading && "animate-spin")} />
                {geo.loading ? "Henter..." : "Min posisjon"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="px-4 py-12 text-center">
              <p className="text-muted-foreground">{error}</p>
              <button onClick={() => load(true)} className="mt-4 text-primary underline text-sm">
                Prøv igjen
              </button>
            </div>
          ) : (
            <>
              {/* Hero card */}
              <HeroCard today={today} loading={loading} source={source} updatedAt={forecast?.updatedAt} locationName={data?.davos.location.name || "Davos"} />

              {/* AI Summary Card */}
              <AiSummaryCard summary={aiSummary} loading={aiLoading} />

              {/* 7-day strip */}
              <section className="mt-4">
                <h2 className="px-4 font-heading text-sm font-medium text-muted-foreground mb-2">
                  7-dagers varsel
                </h2>
                {loading ? (
                  <div className="px-4 flex gap-2 overflow-hidden">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <DavosSkeleton key={i} className="min-w-[72px] h-[100px] rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="w-full">
                    <div className="flex gap-2 px-4 py-1">
                      {(forecast?.daily || []).map((day, i) => (
                        <DayPill key={day.date} day={day} index={i} />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                )}
              </section>

              {/* Mountain areas */}
              <section className="mt-6 px-4 space-y-3">
                <h2 className="font-heading text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-primary" />
                  Fjellområder
                </h2>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <DavosSkeleton key={i} className="h-16 rounded-card" />
                  ))
                ) : (
                  MOUNTAIN_AREAS.map((mt) => {
                    const mtData = data?.mountains.find((m) => m.mountain.id === mt.id);
                    const mtForecast = source === "yr" ? mtData?.yr : mtData?.meteoswiss;
                    const mtToday = mtForecast?.daily?.[0];

                    return (
                      <DavosCard key={mt.id}>
                        <DavosCardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">
                              {mtToday ? getWeatherIcon(mtToday.weatherCode) : "☁️"}
                            </span>
                            <div>
                              <p className="font-heading text-sm font-semibold text-foreground">
                                {mt.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {mt.elevation}m
                              </p>
                            </div>
                          </div>
                          {mtToday ? (
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="font-mono font-semibold text-foreground text-sm">
                                {mtToday.tempMax}° / {mtToday.tempMin}°
                              </span>
                              {mtToday.snow > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Snowflake size={12} className="text-primary" />
                                  {mtToday.snow}cm
                                </span>
                              )}
                              <span className="flex items-center gap-0.5">
                                <Wind size={12} />
                                {mtToday.wind}m/s
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">–</span>
                          )}
                        </DavosCardContent>
                      </DavosCard>
                    );
                  })
                )}
              </section>

              {/* Refresh */}
              <div className="px-4 mt-6 text-center">
                <button
                  onClick={() => load(true)}
                  disabled={loading}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  Oppdater data
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// SUB-COMPONENTS
// ============================================

interface HeroCardProps {
  today: WeatherDaily | null;
  loading: boolean;
  source: SourceTab;
  updatedAt?: string;
  locationName: string;
}

const HeroCard: React.FC<HeroCardProps> = ({ today, loading, source, updatedAt, locationName }) => {
  if (loading || !today) {
    return (
      <DavosCard className="mx-4 mt-2">
        <DavosCardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <DavosSkeleton className="h-14 w-28" />
              <DavosSkeleton className="h-4 w-20" />
            </div>
            <DavosSkeleton variant="circular" className="h-14 w-14" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <DavosSkeleton className="h-12" />
            <DavosSkeleton className="h-12" />
            <DavosSkeleton className="h-12" />
          </div>
        </DavosCardContent>
      </DavosCard>
    );
  }

  const sourceName = source === "yr" ? "Yr" : "MeteoSwiss";
  const isCustomLocation = locationName !== "Davos";

  return (
    <DavosCard className="mx-4 mt-2">
      <DavosCardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isCustomLocation ? (
                <Navigation size={14} className="text-primary" />
              ) : (
                <MapPin size={14} className="text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {locationName} · {sourceName}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-5xl font-bold text-foreground">
                {today.tempMax}°
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                / {today.tempMin}°
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {getWeatherDescription(today.weatherCode)}
            </p>
          </div>
          <span className="text-5xl">{getWeatherIcon(today.weatherCode)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-border">
          <div className="text-center">
            <Snowflake className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="font-mono text-base font-semibold text-foreground">{today.snow} cm</p>
            <p className="text-xs text-muted-foreground">Snø</p>
          </div>
          <div className="text-center">
            <Droplets className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="font-mono text-base font-semibold text-foreground">{today.precip} mm</p>
            <p className="text-xs text-muted-foreground">Nedbør</p>
          </div>
          <div className="text-center">
            <Wind className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className="font-mono text-base font-semibold text-foreground">{today.wind} m/s</p>
            <p className="text-xs text-muted-foreground">Vind</p>
          </div>
        </div>

        {updatedAt && (
          <p className="text-[10px] text-muted-foreground mt-3 text-right">
            Oppdatert: {new Date(updatedAt).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};

interface DayPillProps {
  day: WeatherDaily;
  index: number;
}

const DayPill: React.FC<DayPillProps> = ({ day, index }) => (
  <div
    className={cn(
      "flex flex-col items-center gap-1 min-w-[68px] rounded-xl px-2 py-2.5",
      index === 0 ? "bg-primary/10 border border-primary/20" : "bg-card border border-border"
    )}
  >
    <span className="text-[10px] font-medium text-muted-foreground uppercase">
      {dayLabel(day.date, index)}
    </span>
    <span className="text-xl">{getWeatherIcon(day.weatherCode)}</span>
    <span className="font-mono text-xs font-semibold text-foreground">
      {day.tempMax}° / {day.tempMin}°
    </span>
    {day.snow > 0 && (
      <span className="text-[10px] text-primary font-medium">{day.snow}cm ❄️</span>
    )}
  </div>
);

// ============================================
// AI SUMMARY CARD
// ============================================

interface AiSummaryCardProps {
  summary: ReturnType<typeof useWeatherAiSummary>["summary"];
  loading: boolean;
}

const AiSummaryCard: React.FC<AiSummaryCardProps> = ({ summary, loading }) => {
  if (loading) {
    return (
      <DavosCard className="mx-4 mt-3">
        <DavosCardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <DavosSkeleton className="h-4 w-4" />
            <DavosSkeleton className="h-4 w-32" />
          </div>
          <DavosSkeleton className="h-4 w-full mb-2" />
          <DavosSkeleton className="h-4 w-3/4 mb-2" />
          <DavosSkeleton className="h-3 w-40" />
        </DavosCardContent>
      </DavosCard>
    );
  }

  if (!summary) return null;

  const confidenceColor =
    summary.confidence === "high"
      ? "text-success"
      : summary.confidence === "medium"
        ? "text-warning"
        : "text-destructive";

  return (
    <DavosCard className="mx-4 mt-3">
      <DavosCardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              AI-vurdering (OpenAI)
            </div>
            <div className={cn("flex items-center gap-1 text-[10px] font-medium", confidenceColor)}>
              <Shield className="h-3 w-3" />
              {summary.confidence === "high" ? "Høy" : summary.confidence === "medium" ? "Middels" : "Lav"} sikkerhet
            </div>
          </div>

          {/* Ski conditions highlight */}
          {summary.skiConditions && (
            <div className="bg-primary/10 rounded-lg px-3 py-2">
              <p className="text-sm font-medium text-foreground">{summary.skiConditions}</p>
            </div>
          )}

          {/* Today */}
          {summary.todaySummary && (
            <div className="flex items-start gap-2">
              <Sun className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I dag</p>
                <p className="text-sm text-foreground">{summary.todaySummary}</p>
              </div>
            </div>
          )}

          {/* Tomorrow */}
          {summary.tomorrowSummary && (
            <div className="flex items-start gap-2">
              <CloudSun className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I morgen</p>
                <p className="text-sm text-foreground">{summary.tomorrowSummary}</p>
              </div>
            </div>
          )}

          {/* Source comparison */}
          {summary.sourceComparison && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
              {summary.sourceComparison}
            </p>
          )}

          {/* Timestamp */}
          {summary.generatedAt && (
            <p className="text-[10px] text-muted-foreground text-right">
              Generert: {new Date(summary.generatedAt).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </DavosCardContent>
    </DavosCard>
  );
};

export default WeatherScreen;
