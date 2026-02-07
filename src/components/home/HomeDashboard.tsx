import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { ArrowRightLeft, CalendarDays, Wind, Sun, Cloud, CloudSnow, CloudRain, CloudFog } from "lucide-react";
import { Link } from "react-router-dom";
import { useWeatherAiSummary } from "@/hooks/useWeatherAiSummary";

interface NextEvent {
  title: string;
  start_at: string;
}

export const HomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [rate, setRate] = React.useState<{ rate: number | null; loading: boolean }>({ rate: null, loading: true });
  const [nextEvent, setNextEvent] = React.useState<NextEvent | null>(null);
  const { summary: aiSummary, loading: aiLoading } = useWeatherAiSummary();

  // 1. NOK/CHF rate (ECB via Frankfurter)
  React.useEffect(() => {
    fetch("https://api.frankfurter.dev/v1/latest?base=CHF&symbols=NOK")
      .then((r) => r.json())
      .then((d) => setRate({ rate: d?.rates?.NOK ?? null, loading: false }))
      .catch(() => setRate({ rate: null, loading: false }));
  }, []);

  // 2. Next agenda event
  React.useEffect(() => {
    if (!user) return;
    supabase
      .from("agenda_events")
      .select("title, start_at")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setNextEvent(data[0] as NextEvent);
      });
  }, [user]);

  // Extract a short weather line from AI summary
  const weatherSnippet = React.useMemo(() => {
    if (!aiSummary?.todaySummary) return null;
    // Take first sentence
    const full = aiSummary.todaySummary;
    const first = full.split(/[.!]/).filter(Boolean)[0];
    return first ? first.trim() + "." : full.slice(0, 80);
  }, [aiSummary]);

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {/* CHF/NOK */}
        <div className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-1">
          <ArrowRightLeft size={14} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">CHF→NOK</span>
          <span className="font-heading text-base font-bold text-foreground leading-none">
            {rate.loading ? "…" : rate.rate ? rate.rate.toFixed(2) : "–"}
          </span>
        </div>

        {/* Next event */}
        <Link
          to="/agenda"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-1 text-center"
        >
          <CalendarDays size={14} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Neste</span>
          {nextEvent ? (
            <>
              <span className="font-heading text-[11px] font-semibold text-foreground leading-tight truncate w-full">
                {nextEvent.title}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {format(new Date(nextEvent.start_at), "EEE HH:mm", { locale: nb })}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Ingen</span>
          )}
        </Link>

        {/* Weather – AI vurdering */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          <Sun size={16} className="text-foreground mb-0.5" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Vær</span>
          {aiLoading ? (
            <span className="text-[11px] text-muted-foreground">Laster…</span>
          ) : weatherSnippet ? (
            <span className="font-heading text-[10px] font-medium text-foreground leading-tight line-clamp-3 w-full">
              {weatherSnippet}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Trykk for å se</span>
          )}
        </Link>
      </div>
    </section>
  );
};
