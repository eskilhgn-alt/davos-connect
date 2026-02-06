import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Sparkles, Sun, CloudSun } from "lucide-react";

interface WeatherKiQuoteProps {
  day?: unknown;
  isLoading?: boolean;
  aiSummaryToday?: string | null;
  aiSummaryTomorrow?: string | null;
}

export const WeatherKiQuote: React.FC<WeatherKiQuoteProps> = ({ 
  isLoading,
  aiSummaryToday,
  aiSummaryTomorrow,
}) => {
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

  if (!aiSummaryToday && !aiSummaryTomorrow) return null;

  return (
    <DavosCard className="mx-4 mt-3">
      <DavosCardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            KI-tolker vær
          </div>
          
          {aiSummaryToday && (
            <div className="flex items-start gap-2">
              <Sun className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I dag</p>
                <p className="text-sm text-foreground">{aiSummaryToday}</p>
              </div>
            </div>
          )}
          
          {aiSummaryTomorrow && (
            <div className="flex items-start gap-2">
              <CloudSun className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">I morgen</p>
                <p className="text-sm text-foreground">{aiSummaryTomorrow}</p>
              </div>
            </div>
          )}
        </div>
      </DavosCardContent>
    </DavosCard>
  );
};
