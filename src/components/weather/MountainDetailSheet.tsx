/**
 * MountainDetailSheet – Bottom sheet with detailed weather for a mountain area
 */
import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Snowflake, Droplets, Wind, Mountain, Clock } from "lucide-react";
import { type LocationPoint } from "@/config/locations";
import { type SourceForecast, type WeatherDaily, getWeatherIcon, getWeatherDescription } from "@/services/weather-dual.service";

interface MountainDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mountain: LocationPoint | null;
  forecast: SourceForecast | null;
  sourceName: string;
}

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const d = new Date(dateStr);
  return d.toLocaleDateString("no-NO", { weekday: "long" });
}

export const MountainDetailSheet: React.FC<MountainDetailSheetProps> = ({
  open,
  onOpenChange,
  mountain,
  forecast,
  sourceName,
}) => {
  if (!mountain) return null;

  const days = forecast?.daily || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Mountain size={16} className="text-primary" />
            {mountain.name}
            {mountain.elevation && (
              <span className="text-xs text-muted-foreground font-normal">
                {mountain.elevation}m
              </span>
            )}
          </SheetTitle>
          {forecast?.updatedAt && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={10} />
              Oppdatert {new Date(forecast.updatedAt).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
              {" · "}{sourceName}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pb-6">
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Ingen data tilgjengelig
              </p>
            ) : (
              days.map((day, i) => (
                <DayRow key={day.date} day={day} index={i} />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const DayRow: React.FC<{ day: WeatherDaily; index: number }> = ({ day, index }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
    <div className="text-center min-w-[56px]">
      <p className="text-[10px] font-medium text-muted-foreground uppercase">
        {dayLabel(day.date, index)}
      </p>
      <span className="text-2xl">{getWeatherIcon(day.weatherCode)}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground">
        {day.tempMax}° / {day.tempMin}°
      </p>
      <p className="text-xs text-muted-foreground">
        {getWeatherDescription(day.weatherCode)}
      </p>
    </div>
    <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {day.snow > 0 && (
        <span className="flex items-center gap-1">
          <Snowflake size={11} className="text-primary" />
          {day.snow}cm
        </span>
      )}
      <span className="flex items-center gap-1">
        <Droplets size={11} />
        {day.precip}mm
      </span>
      <span className="flex items-center gap-1">
        <Wind size={11} />
        {day.wind}m/s
      </span>
    </div>
  </div>
);
