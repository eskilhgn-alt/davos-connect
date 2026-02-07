import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { ArrowRightLeft, CalendarDays, Wind, Sun, Cloud, CloudSnow, CloudRain, CloudFog } from "lucide-react";
import { Link } from "react-router-dom";

interface NextEvent {
  title: string;
  start_at: string;
}

interface WeatherNow {
  temp: number;
  tempMin: number;
  tempMax: number;
  wind: number;
  weatherCode: number;
  condition: string;
}

const WMO_MAP: Record<number, { label: string; icon: React.ElementType }> = {
  0: { label: "Klart", icon: Sun },
  1: { label: "Klart", icon: Sun },
  2: { label: "Delvis skyet", icon: Cloud },
  3: { label: "Skyet", icon: Cloud },
  45: { label: "Tåke", icon: CloudFog },
  48: { label: "Tåke", icon: CloudFog },
  51: { label: "Yr", icon: CloudRain },
  53: { label: "Yr", icon: CloudRain },
  55: { label: "Yr", icon: CloudRain },
  61: { label: "Regn", icon: CloudRain },
  63: { label: "Regn", icon: CloudRain },
  65: { label: "Kraftig regn", icon: CloudRain },
  71: { label: "Snø", icon: CloudSnow },
  73: { label: "Snø", icon: CloudSnow },
  75: { label: "Kraftig snø", icon: CloudSnow },
  85: { label: "Snøbyger", icon: CloudSnow },
  86: { label: "Kraftig snøbyge", icon: CloudSnow },
};

function getCondition(code: number) {
  return WMO_MAP[code] ?? { label: "Ukjent", icon: Cloud };
}

export const HomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [rate, setRate] = React.useState<{ rate: number | null; loading: boolean }>({ rate: null, loading: true });
  const [nextEvent, setNextEvent] = React.useState<NextEvent | null>(null);
  const [weather, setWeather] = React.useState<WeatherNow | null>(null);

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

  // 3. Weather from MeteoSwiss (Davos town: 46.8, 9.84)
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
          const cond = getCondition(d.now.weatherCode);
          setWeather({
            temp: d.now.temp,
            tempMin: d.daily[0].tempMin,
            tempMax: d.daily[0].tempMax,
            wind: d.now.wind,
            weatherCode: d.now.weatherCode,
            condition: cond.label,
          });
        }
      })
      .catch(() => {});
  }, []);

  const WeatherIcon = weather ? getCondition(weather.weatherCode).icon : Cloud;

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

        {/* Weather – live data */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          {weather ? (
            <>
              <WeatherIcon size={18} className="text-foreground mb-0.5" />
              <span className="font-heading text-sm font-bold text-foreground leading-none">
                {weather.tempMax}° / {weather.tempMin}°
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                {weather.condition}
              </span>
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <Wind size={9} /> {weather.wind} m/s
              </span>
            </>
          ) : (
            <>
              <Cloud size={14} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Laster…</span>
            </>
          )}
        </Link>
      </div>
    </section>
  );
};
