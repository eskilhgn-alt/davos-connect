import * as React from "react";
import { AppHeader } from "@/components/layout";
import {
  WeatherHero,
  WeatherKiQuote,
  WeatherDayStrip,
  WeatherModelTabs,
  WeatherMountainSection,
  YrWidgetPopup,
  type ModelSelection
} from "@/components/weather";
import {
  getBackendWeather,
  clearBackendWeatherCache,
  type WeatherWithQuote
} from "@/services/weather-backend.service";
import { type DayAggregate } from "@/services/weather.service";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { RefreshCw, Database, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const WeatherScreen: React.FC = () => {
  const [weather, setWeather] = React.useState<WeatherWithQuote | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = React.useState(0);
  const [selectedModel, setSelectedModel] = React.useState<ModelSelection>("consensus");
  const [showYrPopup, setShowYrPopup] = React.useState(false);

  const loadWeather = React.useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRefresh) {
        clearBackendWeatherCache();
      }
      const data = await getBackendWeather(7);
      setWeather(data);
    } catch (err) {
      console.error("Failed to load weather:", err);
      setError("Kunne ikke hente værdata. Prøv igjen senere.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  const handleRefresh = React.useCallback(async () => {
    await loadWeather(true);
  }, [loadWeather]);

  const { containerRef, pullDistance, isRefreshing, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPull: 120
  });

  const getCurrentData = (): DayAggregate[] => {
    if (!weather) return [];
    
    if (selectedModel === "consensus") {
      return weather.davos;
    }
    
    // For specific models, aggregate across all mountains for that model
    const modelData = weather.models[selectedModel];
    if (!modelData) return [];
    
    // Get all forecasts for this model and aggregate
    const allForecasts = Object.values(modelData);
    if (allForecasts.length === 0) return [];
    
    // Simple aggregation: average across mountains
    const dayCount = allForecasts[0]?.length || 0;
    const result: DayAggregate[] = [];
    
    for (let i = 0; i < dayCount; i++) {
      const dayData = allForecasts.map(f => f[i]).filter(Boolean);
      if (dayData.length === 0) continue;
      
      const temps = dayData.map(d => d.temperature);
      const tempMaxes = dayData.map(d => d.temperatureMax);
      const tempMins = dayData.map(d => d.temperatureMin);
      const winds = dayData.map(d => d.wind);
      const windDirs = dayData
        .map(d => d.windDirection)
        .filter((d): d is number => d !== undefined && !isNaN(d));
      const windGusts = dayData
        .map(d => d.windGust)
        .filter((g): g is number => g !== undefined && !isNaN(g));
      
      // Circular mean for wind direction
      let windDirectionDeg: number | undefined;
      if (windDirs.length > 0) {
        let sinSum = 0, cosSum = 0;
        for (const deg of windDirs) {
          const rad = (deg * Math.PI) / 180;
          sinSum += Math.sin(rad);
          cosSum += Math.cos(rad);
        }
        let meanDeg = (Math.atan2(sinSum / windDirs.length, cosSum / windDirs.length) * 180) / Math.PI;
        if (meanDeg < 0) meanDeg += 360;
        windDirectionDeg = Math.round(meanDeg);
      }
      
      result.push({
        date: dayData[0].date,
        tempMedian: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
        tempMin: Math.round(Math.min(...tempMins)),
        tempMax: Math.round(Math.max(...tempMaxes)),
        precipMedian: Math.round(dayData.reduce((a, d) => a + d.precipitation, 0) / dayData.length * 10) / 10,
        snowMedian: Math.round(dayData.reduce((a, d) => a + d.snowfall, 0) / dayData.length * 10) / 10,
        windMedian: Math.round(winds.reduce((a, b) => a + b, 0) / winds.length),
        windDirectionDeg,
        windGustMax: windGusts.length > 0 ? Math.round(Math.max(...windGusts)) : undefined,
        weatherCode: dayData[0].weatherCode,
        confidence: "high" // Single model = always high confidence
      });
    }
    
    return result;
  };

  const currentData = getCurrentData();
  const today = currentData[0] || null;

  const handleDaySelect = (index: number) => {
    setSelectedDayIndex(index);
  };

  // Calculate pull indicator opacity and scale
  const pullProgress = Math.min(pullDistance / 80, 1);
  const showPullIndicator = isPulling || isRefreshing;

  // Data source label - show KI-akkumulert for consensus
  const dataSourceLabel = selectedModel === "consensus" 
    ? (weather?.dataSource || "KI-akkumulert")
    : selectedModel.toUpperCase();

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Vær"
        subtitle={selectedModel === "consensus" ? "Davos konsensus" : selectedModel}
        rightAction={
          (loading || isRefreshing) ? (
            <RefreshCw className="h-5 w-5 animate-spin text-primary-foreground/70" />
          ) : null
        }
      />

      {/* Pull-to-refresh indicator */}
      <div 
        className={cn(
          "flex items-center justify-center overflow-hidden transition-all duration-200 shrink-0",
          showPullIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{ height: pullDistance }}
      >
        <div 
          className="flex flex-col items-center gap-1"
          style={{ 
            transform: `scale(${0.5 + pullProgress * 0.5}) rotate(${pullProgress * 180}deg)`,
            opacity: pullProgress
          }}
        >
          <RefreshCw 
            className={cn(
              "h-6 w-6 text-primary",
              isRefreshing && "animate-spin"
            )} 
          />
        </div>
        {pullProgress >= 1 && !isRefreshing && (
          <span className="text-xs text-muted-foreground ml-2">Slipp for å oppdatere</span>
        )}
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
          transform: `translateY(${pullDistance > 0 ? 0 : 0}px)`,
          touchAction: pullDistance > 0 ? 'none' : 'auto'
        }}
      >
        <div className="pb-4">
          {error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-muted-foreground">{error}</p>
              <button
                onClick={() => loadWeather(true)}
                className="mt-4 text-primary underline"
              >
                Prøv igjen
              </button>
            </div>
          ) : (
            <>
              {/* Hero - Today's weather */}
              <WeatherHero today={today} loading={loading} />

              {/* Data source badge */}
              {weather && (
                <div className="px-4 mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database size={12} />
                  <span>Datakilde: {dataSourceLabel}</span>
                </div>
              )}

              {/* AI weather summary - today + tomorrow */}
              {(weather?.aiSummaryToday || weather?.aiSummaryTomorrow) && (
                <WeatherKiQuote 
                  day={today || undefined} 
                  isLoading={loading}
                  aiSummaryToday={weather?.aiSummaryToday}
                  aiSummaryTomorrow={weather?.aiSummaryTomorrow}
                />
              )}

              {/* 7-day strip - inline preview */}
              <div className="mt-4">
                <h2 className="px-4 font-heading text-sm font-medium text-muted-foreground mb-2">
                  7-dagers varsel
                </h2>
                <WeatherDayStrip
                  days={currentData}
                  selectedIndex={selectedDayIndex}
                  onSelectDay={handleDaySelect}
                  loading={loading}
                />
              </div>

              {/* Model tabs */}
              <div className="mt-4">
                <div className="flex items-center justify-between px-4 mb-2">
                  <h2 className="font-heading text-sm font-medium text-muted-foreground">
                    Datakilde
                  </h2>
                  <button
                    onClick={() => setShowYrPopup(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink size={12} />
                    YR widget
                  </button>
                </div>
                <WeatherModelTabs
                  selected={selectedModel}
                  onSelect={setSelectedModel}
                />
              </div>

              {/* Mountains section */}
              <div className="mt-6">
                <WeatherMountainSection
                  mountains={weather?.mountains || {}}
                  models={weather?.models || {}}
                  selectedModel={selectedModel}
                  loading={loading}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* YR Widget Popup */}
      <YrWidgetPopup
        open={showYrPopup}
        onOpenChange={setShowYrPopup}
      />
    </div>
  );
};

export default WeatherScreen;
