import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isBefore } from "date-fns";
import { nb } from "date-fns/locale";
import { ArrowRightLeft, CalendarDays, CloudSun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface RateData {
  rate: number | null;
  loading: boolean;
}

interface NextEvent {
  title: string;
  start_at: string;
}

export const HomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [rate, setRate] = React.useState<RateData>({ rate: null, loading: true });
  const [nextEvent, setNextEvent] = React.useState<NextEvent | null>(null);
  const [weatherLine, setWeatherLine] = React.useState<string | null>(null);

  // 1. NOK/CHF rate
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

  // 3. Quick weather from ai_daily
  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("weather_ai_daily")
      .select("ai_summary_today")
      .eq("day_date", today)
      .eq("location_id", "davos")
      .order("run_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.ai_summary_today) {
          // Truncate to first sentence
          const full = data[0].ai_summary_today as string;
          const first = full.split(/[.!]/).filter(Boolean)[0];
          setWeatherLine(first ? first.trim() + "." : full.slice(0, 60));
        }
      });
  }, []);

  return (
    <section className="space-y-2">
      {/* Row of mini cards */}
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

        {/* Weather quick */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-1 text-center"
        >
          <CloudSun size={14} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Vær</span>
          <span className="font-heading text-[11px] font-semibold text-foreground leading-tight line-clamp-2 w-full">
            {weatherLine ?? "–"}
          </span>
        </Link>
      </div>
    </section>
  );
};
