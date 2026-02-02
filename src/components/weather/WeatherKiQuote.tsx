import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { getKiWeatherQuote } from "@/features/weather/kiWeatherQuote";
import type { DayAggregate } from "@/services/weather.service";
import { Sparkles } from "lucide-react";

interface BackendQuote {
  quote: string;
  speaker: string;
  category: string;
}

interface WeatherKiQuoteProps {
  day?: DayAggregate;
  isLoading?: boolean;
  backendQuote?: BackendQuote;
  aiSummary?: string | null;
}

export const WeatherKiQuote: React.FC<WeatherKiQuoteProps> = ({ 
  day, 
  isLoading,
  backendQuote,
  aiSummary 
}) => {
  // Use backend quote if available, otherwise compute locally
  const quoteData = React.useMemo(() => {
    if (backendQuote) {
      return {
        quote: backendQuote.quote,
        speaker: backendQuote.speaker,
        category: backendQuote.category,
      };
    }
    return getKiWeatherQuote(day);
  }, [backendQuote, day?.date, day?.weatherCode, day?.snowMedian, day?.tempMin, day?.tempMax]);

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
        {/* AI Summary if available */}
        {aiSummary && (
          <div className="flex items-start gap-2 mb-3 pb-3 border-b border-border">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">KI-tolker vær</p>
              <p className="text-sm text-foreground">{aiSummary}</p>
            </div>
          </div>
        )}

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
