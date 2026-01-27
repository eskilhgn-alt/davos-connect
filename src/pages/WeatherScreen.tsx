import * as React from "react";
import { AppHeader } from "@/components/layout";
import {
  WeatherHero,
  WeatherDayStrip,
  WeatherDayDetail,
  WeatherModelTabs,
  WeatherMountainSection,
  type ModelSelection
} from "@/components/weather";
import {
  getAggregatedWeather,
  clearWeatherCache,
  type AggregatedWeather,
  type DayAggregate
} from "@/services/weather.service";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const WeatherScreen: React.FC = () => {
  const [weather, setWeather] = React.useState<AggregatedWeather | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = React.useState(0);
  const [selectedModel, setSelectedModel] = React.useState<ModelSelection>("consensus");
  const [detailOpen, setDetailOpen] = React.useState(false);

  const loadWeather = React.useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRefresh) {
        clearWeatherCache();
      }
      const data = await getAggregatedWeather(7);
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
      
      result.push({
        date: dayData[0].date,
        tempMedian: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
        tempMin: Math.round(Math.min(...tempMins)),
        tempMax: Math.round(Math.max(...tempMaxes)),
        precipMedian: Math.round(dayData.reduce((a, d) => a + d.precipitation, 0) / dayData.length * 10) / 10,
        snowMedian: Math.round(dayData.reduce((a, d) => a + d.snowfall, 0) / dayData.length * 10) / 10,
        windMedian: Math.round(dayData.reduce((a, d) => a + d.wind, 0) / dayData.length),
        weatherCode: dayData[0].weatherCode,
        confidence: "high" // Single model = always high confidence
      });
    }
    
    return result;
  };

  const currentData = getCurrentData();
  const today = currentData[0] || null;
  const selectedDay = currentData[selectedDayIndex] || null;

  const handleDaySelect = (index: number) => {
    setSelectedDayIndex(index);
    setDetailOpen(true);
  };

  // Calculate pull indicator opacity and scale
  const pullProgress = Math.min(pullDistance / 80, 1);
  const showPullIndicator = isPulling || isRefreshing;

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
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
          "flex items-center justify-center overflow-hidden transition-all duration-200",
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
          transform: `translateY(${pullDistance > 0 ? 0 : 0}px)`,
          touchAction: pullDistance > 0 ? 'none' : 'auto'
        }}
      >
        <div className="pb-24">
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

              {/* 7-day strip */}
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
                <h2 className="px-4 font-heading text-sm font-medium text-muted-foreground mb-2">
                  Datakilde
                </h2>
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

      {/* Day detail sheet */}
      <WeatherDayDetail
        day={selectedDay}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
};

export default WeatherScreen;
