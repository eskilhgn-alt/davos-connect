import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { getKiWeatherQuote } from "@/features/weather/kiWeatherQuote";
import type { DayAggregate } from "@/services/weather.service";
import { Sparkles } from "lucide-react";

interface WeatherKiQuoteProps {
  day?: DayAggregate;
  isLoading?: boolean;
}

export const WeatherKiQuote: React.FC<WeatherKiQuoteProps> = ({ day, isLoading }) => {
  // Memoize quote to prevent re-computation on every render
  const quoteData = React.useMemo(() => {
    return getKiWeatherQuote(day);
  }, [day?.date, day?.weatherCode, day?.snowMedian, day?.tempMin, day?.tempMax]);

  if (isLoading) {
    return (
      <DavosCard className="mx-4 mt-3">
        <DavosCardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DavosSkeleton className="h-4 w-4" variant="circular" />
            <DavosSkeleton className="h-3 w-24" />
          </div>
          <DavosSkeleton className="h-5 w-full mb-2" />
          <DavosSkeleton className="h-3 w-32" />
        </DavosCardContent>
      </DavosCard>
    );
  }

  return (
    <DavosCard className="mx-4 mt-3">
      <DavosCardContent className="p-4">
        {/* Label */}
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            KI tolker været
          </span>
        </div>

        {/* Quote */}
        <blockquote className="text-base italic text-foreground leading-relaxed">
          "{quoteData.quote}"
        </blockquote>

        {/* Speaker */}
        <p className="mt-2 text-sm text-muted-foreground">
          — {quoteData.speaker}
        </p>
      </DavosCardContent>
    </DavosCard>
  );
};
