import * as React from "react";
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
  CloudLightning,
  Droplets,
  MoveRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTripWeather } from "@/hooks/useTripWeather";
import { describeWeatherCode } from "@/services/tripWeather";
import { useTrip } from "@/contexts/TripContext";
import { CurrencyCalculator } from "./CurrencyCalculator";
import { useAgenda } from "@/hooks/useAgenda";
import { formatZonedTime, zonedDateKey } from "@/features/trip/tripDates";

const ICON_MAP = {
  sun: Sun,
  cloud: Cloud,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-drizzle": CloudDrizzle,
  "cloud-fog": CloudFog,
  "cloud-lightning": CloudLightning,
} as const;

function windArrowRotation(deg: number | null | undefined) {
  return { transform: `rotate(${deg ?? 0}deg)` };
}

export interface HomeDashboardHandle {
  /** Refetch weather + next event + FX rate. Called by parent pull-to-refresh. */
  refresh: () => Promise<void>;
}

export const HomeDashboard = React.forwardRef<HomeDashboardHandle>((_, ref) => {
  const { selectedTrip, selectedTripId } = useTrip();
  // Currency comes from the selected trip (not a hardcoded trip constant), so
  // switching to an archived trip in a different currency displays correctly.
  const currency = selectedTrip?.currency ?? "";
  const [rate, setRate] = React.useState<{ rate: number | null; loading: boolean }>({ rate: null, loading: true });
  const [rateDate, setRateDate] = React.useState<string | null>(null);
  const [rateFetchedAt, setRateFetchedAt] = React.useState<Date | null>(null);
  const [calcOpen, setCalcOpen] = React.useState(false);

  const { weather, loading: weatherLoading, refresh: refreshWeather } = useTripWeather();
  // «Neste» bruker samme turspesifikke agenda-kilde som Agenda-skjermen.
  // React Query-nøkkelen er trip-scopet, så et svar for tur A kan aldri
  // vises når tur B er valgt.
  const { nextEvent, refetch: refetchAgenda } = useAgenda();

  const fetchRate = React.useCallback(async () => {
    try {
      const d = await fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=NOK`).then((r) => r.json());
      setRate({ rate: d?.rates?.NOK ?? null, loading: false });
      setRateDate(d?.date ?? null);
      setRateFetchedAt(new Date());
    } catch {
      setRate({ rate: null, loading: false });
    }
  }, [currency]);

  React.useEffect(() => {
    void fetchRate();
  }, [fetchRate]);

  React.useImperativeHandle(ref, () => ({
    refresh: async () => {
      await Promise.allSettled([fetchRate(), refetchAgenda(), refreshWeather()]);
    },
  }), [fetchRate, refetchAgenda, refreshWeather]);


  const current = weather?.current;
  const today = weather?.daily?.[0];
  const codeInfo = describeWeatherCode(current?.weatherCode ?? today?.weatherCode);
  const WeatherIcon = ICON_MAP[codeInfo.icon] ?? Cloud;
  const tempNow = current?.temperatureC != null ? Math.round(current.temperatureC) : null;
  const tempMax = today?.tempMaxC != null ? Math.round(today.tempMaxC) : null;
  const tempMin = today?.tempMinC != null ? Math.round(today.tempMinC) : null;
  const wind = current?.windSpeedMs != null ? Math.round(current.windSpeedMs) : null;
  const snow = today?.snowfallCm ?? current?.snowfallCm ?? 0;

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {/* Valuta – EUR/NOK */}
        <button
          onClick={() => setCalcOpen(true)}
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-1 text-left active:scale-[0.97] transition-transform"
        >
          <ArrowRightLeft size={14} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">1 {currency}</span>
          <span className="font-heading text-sm font-bold text-foreground leading-none">
            {rate.loading ? "…" : rate.rate ? `${rate.rate.toFixed(2)} kr` : "–"}
          </span>
          <span className="text-[8px] text-muted-foreground/60 leading-none w-full text-center truncate">ECB</span>
        </button>

        {/* Neste event */}
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
                {`${zonedDateKey(nextEvent.start_at, selectedTrip?.timezone).slice(5).split("-").reverse().join(".")} kl ${formatZonedTime(nextEvent.start_at, selectedTrip?.timezone)}`}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Ingen</span>
          )}
        </Link>

        {/* Vær – Open-Meteo */}
        <Link
          to="/vaer"
          className="rounded-xl bg-muted/50 border border-border p-3 flex flex-col items-center justify-center gap-0.5 text-center"
        >
          {current && !weatherLoading ? (
            <>
              <WeatherIcon size={20} className="text-foreground" />
              <span className="font-heading text-sm font-bold text-foreground leading-none">
                {tempNow != null ? `${tempNow}°` : "–"}
              </span>
              <span className="text-[9px] text-muted-foreground leading-none">
                {tempMax != null && tempMin != null ? `${tempMax}° / ${tempMin}°` : codeInfo.label}
              </span>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Wind size={9} />
                <span>{wind ?? "–"} m/s</span>
                {current.windDirectionDeg != null && (
                  <MoveRight size={8} style={windArrowRotation(current.windDirectionDeg)} />
                )}
              </div>
              {snow > 0 && (
                <div className="flex items-center gap-0.5 text-[9px] text-primary font-medium">
                  <Droplets size={8} />
                  <span>{snow.toFixed(0)} cm</span>
                </div>
              )}
            </>
          ) : (
            <>
              <Cloud size={16} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {weatherLoading ? "Laster…" : "–"}
              </span>
            </>
          )}
        </Link>
      </div>

      {rate.rate && (
        <CurrencyCalculator
          rate={rate.rate}
          rateDate={rateDate}
          rateFetchedAt={rateFetchedAt}
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </section>
  );
});
HomeDashboard.displayName = "HomeDashboard";

