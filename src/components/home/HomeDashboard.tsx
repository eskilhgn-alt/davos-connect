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

interface WeatherData {
  temp: number;
  tempMin: number;
  tempMax: number;
  wind: number;
  windDir: number;
  weatherCode: number;
  precip: number;
  snow: number;
}

// WMO weather codes → icon + short label
const WMO: Record<number, { icon: React.ElementType; label: string }> = {
  0: { icon: Sun, label: "Klart" },
  1: { icon: Sun, label: "Klart" },
  2: { icon: Cloud, label: "Delvis skyet" },
  3: { icon: Cloud, label: "Skyet" },
  45: { icon: CloudFog, label: "Tåke" },
  48: { icon: CloudFog, label: "Rimtåke" },
  51: { icon: CloudDrizzle, label: "Yr" },
  53: { icon: CloudDrizzle, label: "Yr" },
  55: { icon: CloudDrizzle, label: "Yr" },
  61: { icon: CloudRain, label: "Regn" },
  63: { icon: CloudRain, label: "Regn" },
  65: { icon: CloudRain, label: "Mye regn" },
  71: { icon: CloudSnow, label: "Snø" },
  73: { icon: CloudSnow, label: "Snø" },
  75: { icon: CloudSnow, label: "Mye snø" },
  85: { icon: CloudSnow, label: "Snøbyger" },
  86: { icon: CloudSnow, label: "Kraftig snø" },
};

function getWmo(code: number) {
  return WMO[code] ?? { icon: Cloud, label: "Ukjent" };
}

// Wind direction arrow rotation
function windArrowRotation(deg: number) {
  return { transform: `rotate(${deg}deg)` };
}

export const HomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [rate, setRate] = React.useState<{ rate: number | null; loading: boolean }>({ rate: null, loading: true });
  const [nextEvent, setNextEvent] = React.useState<NextEvent | null>(null);
  const [wx, setWx] = React.useState<WeatherData | null>(null);

  // Start AI summary fetch (warms cache for weather page)
  useWeatherAiSummary();

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

  // 3. Weather numbers from MeteoSwiss (Davos 46.8, 9.84)
  React.useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather-meteoswiss?lat=46.8&lon=9.84`;
    fetch(url, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.now && d?.daily?.[0]) {
          setWx({
            temp: d.now.temp,
            tempMin: d.daily[0].tempMin,
            tempMax: d.daily[0].tempMax,
            wind: d.now.wind,
            windDir: d.now.windDir,
            weatherCode: d.now.weatherCode,
            precip: d.daily[0].precip ?? 0,
            snow: d.daily[0].snow ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  const wmo = wx ? getWmo(wx.weatherCode) : null;
  const WeatherIcon = wmo?.icon ?? Cloud;

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

        {/* Weather – icons + numbers */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          {wx ? (
            <>
              <WeatherIcon size={20} className="text-foreground" />
              <span className="font-heading text-sm font-bold text-foreground leading-none">
                {wx.tempMax}° / {wx.tempMin}°
              </span>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Wind size={9} />
                <span>{wx.wind} m/s</span>
                <MoveRight size={8} style={windArrowRotation(wx.windDir)} />
              </div>
              {wx.snow > 0 && (
                <div className="flex items-center gap-0.5 text-[9px] text-primary font-medium">
                  <Droplets size={8} />
                  <span>{wx.snow} cm snø</span>
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
