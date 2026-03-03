/**
 * WeatherScreen — Yr-based, position-aware weather
 * Supports GPS + manual location search
 */

import * as React from "react";
import { AppHeader } from "@/components/layout";
import { BackButton } from "@/components/layout/BackButton";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  getDualWeather,
  clearDualWeatherCache,
  getWeatherIcon,
  getWeatherDescription,
  type FullWeatherData,
  type WeatherDaily,
} from "@/services/weather-dual.service";
import { useWeatherAiSummary } from "@/hooks/useWeatherAiSummary";
import { useGeolocation } from "@/hooks/useGeolocation";
import { RefreshCw, Snowflake, Droplets, Wind, MapPin, Navigation, Sparkles, Sun, CloudSun, Shield, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WeatherForecastChart } from "@/components/weather/WeatherForecastChart";
import { DavosInput } from "@/components/ui/davos-input";

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const d = new Date(dateStr);
  return d.toLocaleDateString("no-NO", { weekday: "short" }).replace(".", "");
}

const WeatherScreen: React.FC = () => {
  const geo = useGeolocation();
  const [customLocation, setCustomLocation] = React.useState<{ lat: number; lon: number; name: string } | null>(null);
  const [locationName, setLocationName] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);

  const effectivePos = customLocation
    ? { lat: customLocation.lat, lon: customLocation.lon }
    : geo.position
      ? { lat: geo.position.lat, lon: geo.position.lon }
      : undefined;

  const { summary: aiSummary, loading: aiLoading } = useWeatherAiSummary(effectivePos);
  const [data, setData] = React.useState<FullWeatherData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = React.useState<number | null>(null);

  // Reverse geocode
  React.useEffect(() => {
    if (customLocation) { setLocationName(customLocation.name); return; }
    if (!geo.position) { setLocationName(null); return; }
    const { lat, lon } = geo.position;
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=no`)
      .then(r => r.json())
      .then(d => {
        const name = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || d.display_name?.split(",")[0] || "Ukjent sted";
        setLocationName(name);
      })
      .catch(() => setLocationName("Min posisjon"));
  }, [geo.position, customLocation]);

  const handleSearch = React.useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5&accept-language=no`);
      const results = await res.json();
      setSearchResults(results);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [searchQuery]);

  const selectSearchResult = (result: any) => {
    setCustomLocation({ lat: parseFloat(result.lat), lon: parseFloat(result.lon), name: result.display_name.split(",")[0] });
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearCustomLocation = () => {
    setCustomLocation(null);
    if (geo.position) load(true);
  };

  const load = React.useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) clearDualWeatherCache();
      const result = await getDualWeather(force, effectivePos);
      setData(result);
    } catch (err) {
      console.error("Weather load failed:", err);
      setError("Kunne ikke laste værdata.");
    } finally {
      setLoading(false);
    }
  }, [effectivePos]);

  const hasLoaded = React.useRef(false);
  React.useEffect(() => {
    if (!hasLoaded.current) { hasLoaded.current = true; load(); }
  }, []);

  const prevPosRef = React.useRef<{ lat: number; lon: number } | null>(null);
  React.useEffect(() => {
    if (!effectivePos) return;
    const prev = prevPosRef.current;
    if (!prev || Math.abs(prev.lat - effectivePos.lat) > 0.001 || Math.abs(prev.lon - effectivePos.lon) > 0.001) {
      prevPosRef.current = { lat: effectivePos.lat, lon: effectivePos.lon };
      if (hasLoaded.current) load(true);
    }
  }, [effectivePos, load]);

  const forecast = data?.forecast ?? null;
  const today = forecast?.daily?.[0] || null;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Vær"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={loading ? <RefreshCw className="h-5 w-5 animate-spin text-primary-foreground/70" /> : null}
      />

      <PullToRefreshWrapper
        onRefresh={async () => { await load(true); }}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="pb-6">
          {/* Location controls */}
          <div className="px-4 pt-4 pb-2 space-y-2">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => {
                  if (customLocation) { clearCustomLocation(); return; }
                  if (!geo.enabled) { geo.request(); } else { load(true); }
                }}
                disabled={geo.loading}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0",
                  geo.enabled && !customLocation
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                <Navigation size={13} className={cn(geo.loading && "animate-spin")} />
                {geo.loading ? "Henter..." : "📍 Min posisjon"}
              </button>
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0",
                  searchOpen || customLocation
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}
              >
                <Search size={13} />
                Søk sted
              </button>
            </div>

            {locationName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={12} className="text-primary shrink-0" />
                <span className="truncate">{locationName}</span>
                {customLocation && (
                  <button onClick={clearCustomLocation} className="shrink-0 ml-1 text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {searchOpen && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <DavosInput
                    type="search"
                    placeholder="Søk etter sted..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                    autoFocus
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                  >
                    {searching ? "..." : "Søk"}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                    {searchResults.map((r: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => selectSearchResult(r)}
                        className="w-full text-left px-3 py-2.5 text-xs hover:bg-muted/50 active:bg-muted transition-colors"
                      >
                        <p className="font-medium text-foreground">{r.display_name.split(",")[0]}</p>
                        <p className="text-muted-foreground truncate">{r.display_name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error ? (
            <div className="px-4 py-12 text-center">
              <p className="text-muted-foreground">{error}</p>
              <button onClick={() => load(true)} className="mt-4 text-primary underline text-sm">Prøv igjen</button>
            </div>
          ) : (
            <>
              <HeroCard today={today} loading={loading} updatedAt={forecast?.updatedAt} locationName={locationName || (effectivePos ? "Laster sted..." : "Standard")} />

              <AiSummaryCard summary={aiSummary} loading={aiLoading} />

              <WeatherForecastChart daily={forecast?.daily || []} hourly={forecast?.hourly || []} loading={loading} />

              {/* 7-day strip */}
              <section className="mt-4">
                <h2 className="px-4 font-heading text-sm font-medium text-muted-foreground mb-2">7-dagers varsel</h2>
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
                        <DayPill key={day.date} day={day} index={i} onTap={() => setSelectedDayIndex(i)} />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                )}
              </section>

              <div className="px-4 mt-6 text-center">
                <button onClick={() => load(true)} disabled={loading} className="text-xs text-primary hover:underline disabled:opacity-50">
                  Oppdater data
                </button>
              </div>
            </>
          )}
        </div>
      </PullToRefreshWrapper>

      <DayDetailSheet
        day={selectedDayIndex !== null ? (forecast?.daily?.[selectedDayIndex] ?? null) : null}
        index={selectedDayIndex}
        open={selectedDayIndex !== null}
        onClose={() => setSelectedDayIndex(null)}
      />
    </div>
  );
};

// ============================================
// SUB-COMPONENTS
// ============================================

interface HeroCardProps {
  today: WeatherDaily | null;
  loading: boolean;
  updatedAt?: string;
  locationName: string;
}

const HeroCard: React.FC<HeroCardProps> = ({ today, loading, updatedAt, locationName }) => {
  if (loading || !today) {
    return (
      <DavosCard className="mx-4 mt-2">
        <DavosCardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2"><DavosSkeleton className="h-14 w-28" /><DavosSkeleton className="h-4 w-20" /></div>
            <DavosSkeleton variant="circular" className="h-14 w-14" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4"><DavosSkeleton className="h-12" /><DavosSkeleton className="h-12" /><DavosSkeleton className="h-12" /></div>
        </DavosCardContent>
      </DavosCard>
    );
  }

  return (
    <DavosCard className="mx-4 mt-2">
      <DavosCardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={14} className="text-primary" />
              <span className="text-xs text-muted-foreground">{locationName}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-5xl font-bold text-foreground">{today.tempMax}°</span>
              <span className="font-mono text-sm text-muted-foreground">/ {today.tempMin}°</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{getWeatherDescription(today.weatherCode)}</p>
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

interface DayPillProps { day: WeatherDaily; index: number; onTap: () => void; }

const DayPill: React.FC<DayPillProps> = ({ day, index, onTap }) => (
  <button
    type="button"
    onClick={onTap}
    className={cn(
      "flex flex-col items-center gap-1 min-w-[68px] rounded-xl px-2 py-2.5",
      "active:scale-95 transition-transform cursor-pointer",
      index === 0 ? "bg-primary/10 border border-primary/20" : "bg-card border border-border"
    )}
  >
    <span className="text-[10px] font-medium text-muted-foreground uppercase">{dayLabel(day.date, index)}</span>
    <span className="text-xl">{getWeatherIcon(day.weatherCode)}</span>
    <span className="font-mono text-xs font-semibold text-foreground">{day.tempMax}° / {day.tempMin}°</span>
    {day.snow > 0 && <span className="text-[10px] text-primary font-medium">{day.snow}cm ❄️</span>}
  </button>
);

// ============================================
// DAY DETAIL SHEET
// ============================================

interface DayDetailSheetProps { day: WeatherDaily | null; index: number | null; open: boolean; onClose: () => void; }

const DayDetailSheet: React.FC<DayDetailSheetProps> = ({ day, index, open, onClose }) => {
  if (!open || !day || index === null) return null;

  const dateLabel2 = index === 0 ? "I dag" : index === 1 ? "I morgen" : new Date(day.date).toLocaleDateString("no-NO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className={cn("w-full max-w-lg bg-background rounded-t-2xl", "animate-in slide-in-from-bottom duration-200")} onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "75vh" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="font-heading text-lg font-semibold capitalize">{dateLabel2}</h3>
            <p className="text-sm text-muted-foreground">{getWeatherDescription(day.weatherCode)}</p>
          </div>
          <span className="text-4xl">{getWeatherIcon(day.weatherCode)}</span>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-heading text-4xl font-bold text-foreground">{day.tempMax}°</span>
            <span className="font-mono text-lg text-muted-foreground">/ {day.tempMin}°</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 px-5 pb-4">
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Snowflake className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-lg font-bold">{day.snow}</p>
            <p className="text-[10px] text-muted-foreground">cm snø</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Droplets className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-lg font-bold">{day.precip}</p>
            <p className="text-[10px] text-muted-foreground">mm nedbør</p>
          </div>
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <Wind className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-lg font-bold">{day.wind}</p>
            <p className="text-[10px] text-muted-foreground">m/s vind</p>
          </div>
          {day.windGust && (
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <Wind className="h-5 w-5 mx-auto text-destructive mb-1" />
              <p className="font-mono text-lg font-bold">{day.windGust}</p>
              <p className="text-[10px] text-muted-foreground">m/s kast</p>
            </div>
          )}
        </div>

        <div className="flex justify-center pb-4">
          <button type="button" onClick={onClose} className="px-6 py-1.5 rounded-full bg-muted text-sm text-muted-foreground">Lukk</button>
        </div>
      </div>
    </div>
  );
};

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
          <div className="flex items-center gap-2 mb-3"><DavosSkeleton className="h-4 w-4" /><DavosSkeleton className="h-4 w-32" /></div>
          <DavosSkeleton className="h-4 w-full mb-2" />
          <DavosSkeleton className="h-4 w-3/4 mb-2" />
          <DavosSkeleton className="h-3 w-40" />
        </DavosCardContent>
      </DavosCard>
    );
  }

  if (!summary) return null;

  const confidenceColor = summary.confidence === "high" ? "text-success" : summary.confidence === "medium" ? "text-warning" : "text-destructive";

  return (
    <DavosCard className="mx-4 mt-3">
      <DavosCardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              AI-vurdering
            </div>
            <div className={cn("flex items-center gap-1 text-[10px] font-medium", confidenceColor)}>
              <Shield className="h-3 w-3" />
              {summary.confidence === "high" ? "Høy" : summary.confidence === "medium" ? "Middels" : "Lav"} sikkerhet
            </div>
          </div>

          {summary.todaySummary && (
            <div className="flex items-start gap-2">
              <Sun className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I dag</p>
                <p className="text-sm text-foreground">{summary.todaySummary}</p>
              </div>
            </div>
          )}

          {summary.tomorrowSummary && (
            <div className="flex items-start gap-2">
              <CloudSun className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I morgen</p>
                <p className="text-sm text-foreground">{summary.tomorrowSummary}</p>
              </div>
            </div>
          )}

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
