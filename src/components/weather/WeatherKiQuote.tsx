import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { getKiWeatherQuote } from "@/features/weather/kiWeatherQuote";
import type { DayAggregate } from "@/services/weather.service";
import { Sparkles, Sun, CloudSun } from "lucide-react";

interface BackendQuote {
  quote: string;
  speaker: string;
  category: string;
}

interface WeatherKiQuoteProps {
  day?: DayAggregate;
  isLoading?: boolean;
  backendQuote?: BackendQuote;
  aiSummaryToday?: string | null;
  aiSummaryTomorrow?: string | null;
  /** @deprecated Use aiSummaryToday instead */
  aiSummary?: string | null;
}

export const WeatherKiQuote: React.FC<WeatherKiQuoteProps> = ({ 
  day, 
  isLoading,
  backendQuote,
  aiSummaryToday,
  aiSummaryTomorrow,
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

  // Use new format if available, fall back to old
  const todaySummary = aiSummaryToday || aiSummary;

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
        {/* AI Summaries - Today and Tomorrow */}
        {(todaySummary || aiSummaryTomorrow) && (
          <div className="space-y-3 mb-3 pb-3 border-b border-border">
            <div className="flex items-start gap-2 text-xs font-medium text-muted-foreground mb-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              KI-tolker vær
            </div>
            
            {/* Today */}
            {todaySummary && (
              <div className="flex items-start gap-2">
                <Sun className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">I dag</p>
                  <p className="text-sm text-foreground">{todaySummary}</p>
                </div>
              </div>
            )}
            
            {/* Tomorrow */}
            {aiSummaryTomorrow && (
              <div className="flex items-start gap-2">
                <CloudSun className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">I morgen</p>
                  <p className="text-sm text-foreground">{aiSummaryTomorrow}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quote - format: quote + newline + " - Speaker" */}
        <p className="text-base italic text-foreground leading-relaxed">
          {quoteData.quote}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          - {quoteData.speaker}
        </p>
      </DavosCardContent>
    </DavosCard>
  );
};
