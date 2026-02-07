import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  ArrowRightLeft,
  CalendarDays,
  Wind,
  Sun,
  Cloud,
  CloudSnow,
  CloudRain,
  CloudFog,
  CloudDrizzle,
  Droplets,
  MoveRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWeatherAiSummary } from "@/hooks/useWeatherAiSummary";

interface NextEvent {
  title: string;
  start_at: string;
}

// WMO weather codes → icon
const WMO: Record<number, { icon: React.ElementType }> = {
  0: { icon: Sun }, 1: { icon: Sun },
  2: { icon: Cloud }, 3: { icon: Cloud },
  45: { icon: CloudFog }, 48: { icon: CloudFog },
  51: { icon: CloudDrizzle }, 53: { icon: CloudDrizzle }, 55: { icon: CloudDrizzle },
  61: { icon: CloudRain }, 63: { icon: CloudRain }, 65: { icon: CloudRain },
  71: { icon: CloudSnow }, 73: { icon: CloudSnow }, 75: { icon: CloudSnow },
  85: { icon: CloudSnow }, 86: { icon: CloudSnow },
};

function getWmoIcon(code: number) {
  return WMO[code]?.icon ?? Cloud;
}

function windArrowRotation(deg: number) {
  return { transform: `rotate(${deg}deg)` };
}

export const HomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [rate, setRate] = React.useState<{ rate: number | null; loading: boolean }>({ rate: null, loading: true });
  const [nextEvent, setNextEvent] = React.useState<NextEvent | null>(null);

  // AI weather summary (includes structured weather numbers)
  const { summary: aiSummary, loading: aiLoading } = useWeatherAiSummary();
  const wx = aiSummary?.weather;

  // 1. NOK/CHF (ECB)
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

  const WeatherIcon = wx ? getWmoIcon(wx.weatherCode) : Cloud;

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {/* CHF → NOK */}
        <div className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-1">
          <ArrowRightLeft size={14} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">1 CHF</span>
          <span className="font-heading text-sm font-bold text-foreground leading-none">
            {rate.loading ? "…" : rate.rate ? `${rate.rate.toFixed(2)} kr` : "–"}
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

        {/* Weather – from AI assessment */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          {wx && !aiLoading ? (
            <>
              <WeatherIcon size={20} className="text-foreground" />
              <span className="font-heading text-sm font-bold text-foreground leading-none">
                {wx.tempMax != null ? `${wx.tempMax}°` : "–"} / {wx.tempMin != null ? `${wx.tempMin}°` : "–"}
              </span>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Wind size={9} />
                <span>{wx.wind ?? "–"} m/s</span>
                <MoveRight size={8} style={windArrowRotation(wx.windDir)} />
              </div>
              {wx.snow > 0 && (
                <div className="flex items-center gap-0.5 text-[9px] text-primary font-medium">
                  <Droplets size={8} />
                  <span>{wx.snow} cm</span>
                </div>
              )}
            </>
          ) : (
            <>
              <Cloud size={16} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Laster…</span>
            </>
          )}
        </Link>
      </div>
    </section>
  );
};
