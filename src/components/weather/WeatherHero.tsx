import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosBadge } from "@/components/ui/davos-badge";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { type DayAggregate, getWeatherIcon } from "@/services/weather.service";
import { Snowflake, Droplets, Wind } from "lucide-react";
import { formatWindDisplay } from "@/features/weather/windUtils";

interface WeatherHeroProps {
  today: DayAggregate | null;
  loading?: boolean;
}

export const WeatherHero: React.FC<WeatherHeroProps> = ({ today, loading }) => {
  if (loading || !today) {
    return (
      <DavosCard className="mx-4 mt-4">
        <DavosCardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <DavosSkeleton className="h-16 w-32" />
              <DavosSkeleton className="h-4 w-24" />
            </div>
            <DavosSkeleton variant="circular" className="h-16 w-16" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <DavosSkeleton className="h-12" />
            <DavosSkeleton className="h-12" />
            <DavosSkeleton className="h-12" />
          </div>
        </DavosCardContent>
      </DavosCard>
    );
  }

  const confidenceVariant = {
    high: "success" as const,
    medium: "warning" as const,
    low: "critical" as const
  };

  const confidenceLabel = {
    high: "Høy",
    medium: "Middels",
    low: "Lav"
  };

  return (
    <DavosCard className="mx-4 mt-4">
      <DavosCardContent className="p-6">
        {/* Main temp display */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-5xl font-bold text-foreground">
                {today.tempMedian}°
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                ({today.tempMin}° → {today.tempMax}°)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <DavosBadge variant={confidenceVariant[today.confidence]} size="sm">
                {confidenceLabel[today.confidence]} sikkerhet
              </DavosBadge>
            </div>
          </div>
          <span className="text-5xl">{getWeatherIcon(today.weatherCode)}</span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border">
          <div className="text-center">
            <Snowflake className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-lg font-semibold text-foreground">
              {today.snowMedian} cm
            </p>
            <p className="text-xs text-muted-foreground">Snø</p>
          </div>
          <div className="text-center">
            <Droplets className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-lg font-semibold text-foreground">
              {today.precipMedian} mm
            </p>
            <p className="text-xs text-muted-foreground">Nedbør</p>
          </div>
          <div className="text-center">
            <Wind className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="font-mono text-sm font-semibold text-foreground">
              {formatWindDisplay(today.windMedian, today.windDirectionDeg)}
            </p>
            {today.windGustMax && (
              <p className="text-xs text-muted-foreground">Kast: {today.windGustMax} m/s</p>
            )}
            {!today.windGustMax && (
              <p className="text-xs text-muted-foreground">Vind</p>
            )}
          </div>
        </div>
      </DavosCardContent>
    </DavosCard>
  );
};
