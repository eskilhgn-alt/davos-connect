import * as React from "react";
import { DavosCard, DavosCardContent, DavosCardHeader, DavosCardTitle } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MOUNTAINS } from "@/config/mountains";
import { type DayAggregate, type DayForecast, getWeatherIcon } from "@/services/weather.service";
import { ChevronRight, Mountain } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ModelSelection } from "./WeatherModelTabs";

interface WeatherMountainSectionProps {
  mountains: Record<string, DayAggregate[]>;
  models: Record<string, Record<string, DayForecast[]>>;
  selectedModel: ModelSelection;
  onMountainClick?: (mountainId: string) => void;
  loading?: boolean;
}

interface MiniDayProps {
  temp: number;
  icon: string;
  snow?: number;
}

const MiniDay: React.FC<MiniDayProps> = ({ temp, icon, snow }) => (
  <div className="flex flex-col items-center gap-0.5 min-w-[40px]">
    <span className="text-sm">{icon}</span>
    <span className="font-mono text-xs font-medium text-foreground">{temp}°</span>
    {snow !== undefined && snow > 0 && (
      <span className="font-mono text-[10px] text-muted-foreground">
        {snow}cm
      </span>
    )}
  </div>
);

export const WeatherMountainSection: React.FC<WeatherMountainSectionProps> = ({
  mountains,
  models,
  selectedModel,
  onMountainClick,
  loading
}) => {
  if (loading) {
    return (
      <div className="px-4 space-y-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">Fjellområder</h2>
        {[...Array(5)].map((_, i) => (
          <DavosSkeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>
    );
  }

  const getMountainData = (mountainId: string) => {
    if (selectedModel === "consensus") {
      return mountains[mountainId]?.slice(0, 5) || [];
    }
    
    const modelData = models[selectedModel]?.[mountainId];
    if (!modelData) return [];
    
    return modelData.slice(0, 5).map(d => ({
      date: d.date,
      tempMedian: Math.round(d.temperature),
      weatherCode: d.weatherCode,
      snowMedian: d.snowfall
    }));
  };

  return (
    <div className="px-4 pb-24 space-y-3">
      <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
        <Mountain className="h-5 w-5 text-primary" />
        Fjellområder
      </h2>
      
      {MOUNTAINS.map(mountain => {
        const data = getMountainData(mountain.id);
        
        return (
          <DavosCard
            key={mountain.id}
            className="cursor-pointer active:scale-[0.98] transition-transform"
            onClick={() => onMountainClick?.(mountain.id)}
          >
            <DavosCardHeader className="py-3 pb-0">
              <div className="flex items-center justify-between">
                <DavosCardTitle className="text-base">{mountain.name}</DavosCardTitle>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </DavosCardHeader>
            <DavosCardContent className="py-3">
              <ScrollArea className="w-full">
                <div className="flex gap-3">
                  {data.length > 0 ? (
                    data.map((day, i) => (
                      <MiniDay
                        key={i}
                        temp={day.tempMedian}
                        icon={getWeatherIcon(day.weatherCode)}
                        snow={day.snowMedian}
                      />
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Ingen data tilgjengelig
                    </span>
                  )}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </DavosCardContent>
          </DavosCard>
        );
      })}
    </div>
  );
};
