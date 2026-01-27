import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { getKiWeatherQuote } from "@/features/weather/kiWeatherQuote";
import type { DayAggregate } from "@/services/weather.service";

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
          <DavosSkeleton className="h-5 w-full mb-2" />
          <DavosSkeleton className="h-3 w-32" />
        </DavosCardContent>
      </DavosCard>
    );
  }

  return (
    <DavosCard className="mx-4 mt-3">
      <DavosCardContent className="p-4">
        {/* Quote */}
        <p className="text-base italic text-foreground leading-relaxed">
          {quoteData.quote}
        </p>

        {/* Speaker - format: " - Speaker Name" */}
        <p className="mt-2 text-sm text-muted-foreground">
          &nbsp;- {quoteData.speaker}
        </p>
      </DavosCardContent>
    </DavosCard>
  );
};
