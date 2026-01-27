import * as React from "react";
import { AppHeader } from "@/components/layout";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  type AggregatedWeather,
  type DayAggregate
} from "@/services/weather.service";
import { RefreshCw } from "lucide-react";

const WeatherScreen: React.FC = () => {
  const [weather, setWeather] = React.useState<AggregatedWeather | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = React.useState(0);
  const [selectedModel, setSelectedModel] = React.useState<ModelSelection>("consensus");
  const [detailOpen, setDetailOpen] = React.useState(false);

  React.useEffect(() => {
    loadWeather();
  }, []);

  const loadWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAggregatedWeather(7);
      setWeather(data);
    } catch (err) {
      console.error("Failed to load weather:", err);
      setError("Kunne ikke hente værdata. Prøv igjen senere.");
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <AppHeader
        title="Vær"
        subtitle={selectedModel === "consensus" ? "Davos konsensus" : selectedModel}
        rightAction={
          loading ? (
            <RefreshCw className="h-5 w-5 animate-spin text-primary-foreground/70" />
          ) : null
        }
      />

      <ScrollArea className="flex-1">
        <div className="pb-4">
          {error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-muted-foreground">{error}</p>
              <button
                onClick={loadWeather}
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
      </ScrollArea>

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
