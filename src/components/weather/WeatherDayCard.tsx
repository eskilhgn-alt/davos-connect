import * as React from "react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { type DayAggregate, getWeatherIcon } from "@/services/weather.service";

interface WeatherDayCardProps {
  day: DayAggregate;
  selected?: boolean;
  onClick?: () => void;
}

export const WeatherDayCard: React.FC<WeatherDayCardProps> = ({
  day,
  selected,
  onClick
}) => {
  const date = parseISO(day.date);
  
  const getDayLabel = () => {
    if (isToday(date)) return "I dag";
    if (isTomorrow(date)) return "I morgen";
    return format(date, "EEEE", { locale: nb });
  };

  const getDateLabel = () => {
    return format(date, "d. MMMM", { locale: nb });
  };

  const confidenceColor = {
    high: "bg-secondary",
    medium: "bg-accent",
    low: "bg-destructive"
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-3 rounded-xl min-w-[72px] transition-all",
        "hover:bg-muted/50 active:scale-95",
        selected && "bg-primary text-primary-foreground"
      )}
    >
      <span className={cn(
        "text-xs font-medium capitalize truncate max-w-full",
        selected ? "text-primary-foreground" : "text-foreground"
      )}>
        {getDayLabel()}
      </span>
      <span className={cn(
        "text-[10px] capitalize",
        selected ? "text-primary-foreground/80" : "text-muted-foreground"
      )}>
        {getDateLabel()}
      </span>
      
      <span className="text-2xl">{getWeatherIcon(day.weatherCode)}</span>
      
      <span className={cn(
        "font-mono text-lg font-semibold",
        selected ? "text-primary-foreground" : "text-foreground"
      )}>
        {day.tempMedian}°
      </span>
      
      {day.snowMedian > 0 && (
        <span className={cn(
          "font-mono text-xs",
          selected ? "text-primary-foreground/80" : "text-muted-foreground"
        )}>
          ❄️ {day.snowMedian}cm
        </span>
      )}
      
      {/* Confidence indicator */}
      <div className={cn(
        "w-2 h-2 rounded-full mt-1",
        selected ? "bg-primary-foreground/50" : confidenceColor[day.confidence]
      )} />
    </button>
  );
};
