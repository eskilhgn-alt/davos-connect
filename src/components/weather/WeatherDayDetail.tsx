import * as React from "react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DavosBadge } from "@/components/ui/davos-badge";
import { type DayAggregate, getWeatherIcon, getWeatherDescription } from "@/services/weather.service";
import { Snowflake, Droplets, Wind, Thermometer, TrendingUp, TrendingDown } from "lucide-react";
import { formatWindDisplay } from "@/features/weather/windUtils";

interface WeatherDayDetailProps {
  day: DayAggregate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WeatherDayDetail: React.FC<WeatherDayDetailProps> = ({
  day,
  open,
  onOpenChange
}) => {
  if (!day) return null;

  const date = parseISO(day.date);
  
  const getDateLabel = () => {
    if (isToday(date)) return "I dag";
    if (isTomorrow(date)) return "I morgen";
    return format(date, "EEEE d. MMMM", { locale: nb });
  };

  const confidenceVariant = {
    high: "success" as const,
    medium: "warning" as const,
    low: "critical" as const
  };

  const confidenceLabel = {
    high: "Høy sikkerhet",
    medium: "Middels sikkerhet",
    low: "Lav sikkerhet"
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-heading text-xl capitalize">
              {getDateLabel()}
            </SheetTitle>
            <span className="text-4xl">{getWeatherIcon(day.weatherCode)}</span>
          </div>
          <p className="text-muted-foreground">
            {getWeatherDescription(day.weatherCode)}
          </p>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Temperature section */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Thermometer className="h-5 w-5 text-primary" />
              <span className="font-medium">Temperatur</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-heading text-4xl font-bold">
                {day.tempMedian}°
              </span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingDown className="h-4 w-4" />
                <span>{day.tempMin}°</span>
                <TrendingUp className="h-4 w-4 ml-2" />
                <span>{day.tempMax}°</span>
              </div>
            </div>
            <div className="mt-3">
              <DavosBadge variant={confidenceVariant[day.confidence]} size="sm">
                {confidenceLabel[day.confidence]}
              </DavosBadge>
              <p className="text-xs text-muted-foreground mt-1">
                Spenn: {day.tempMax - day.tempMin}° mellom modellene
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Snowflake className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="font-mono text-2xl font-bold">{day.snowMedian}</p>
              <p className="text-xs text-muted-foreground">cm snø</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Droplets className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="font-mono text-2xl font-bold">{day.precipMedian}</p>
              <p className="text-xs text-muted-foreground">mm nedbør</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Wind className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="font-mono text-sm font-bold">
                {formatWindDisplay(day.windMedian, day.windDirectionDeg)}
              </p>
              {day.windGustMax && (
                <p className="text-xs text-muted-foreground">Kast: {day.windGustMax} m/s</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
