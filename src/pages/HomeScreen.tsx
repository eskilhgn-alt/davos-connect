/**
 * HomeScreen – Minimal, editorial landing
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { getBackendWeather, type WeatherWithQuote } from "@/services/weather-backend.service";
import { getWeatherIcon } from "@/services/weather.service";
import { 
  ArrowRight,
  Sparkles,
  Wind,
  Snowflake
} from "lucide-react";

export const HomeScreen: React.FC = () => {
  const { profile } = useAuth();
  const unreadCount = useUnreadCount();
  const [weather, setWeather] = React.useState<WeatherWithQuote | null>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await getBackendWeather(2);
        setWeather(data);
      } catch {
        // Ignore
      } finally {
        setWeatherLoading(false);
      }
    };
    load();
  }, []);

  const today = weather?.davos?.[0];
  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 10) return "God morgen";
    if (hour < 17) return "Hei";
    return "God kveld";
  }, []);

  const displayName = profile?.nickname || profile?.full_name?.split(" ")[0] || "skiløper";

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Lift & Lager" />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="px-6 py-8 space-y-10">
          {/* Welcome – large editorial type */}
          <section>
            <h1 className="font-heading text-3xl font-bold text-foreground leading-tight">
              {greeting},<br />{displayName}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Davos Klosters
            </p>
          </section>

          {/* Weather – inline, no card chrome */}
          <section>
            <Link to="/vaer" className="block group">
              {weatherLoading ? (
                <div className="space-y-3">
                  <DavosSkeleton className="h-10 w-20" />
                  <DavosSkeleton className="h-4 w-40" />
                </div>
              ) : today ? (
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl">{getWeatherIcon(today.weatherCode)}</span>
                    <span className="font-heading text-4xl font-bold text-foreground">
                      {today.tempMedian}°
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    {today.snowMedian > 0 && (
                      <span className="flex items-center gap-1">
                        <Snowflake size={14} />
                        {today.snowMedian} cm
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Wind size={14} />
                      {today.windMedian} m/s
                    </span>
                    <span className="flex items-center gap-1 ml-auto text-foreground group-hover:underline">
                      Detaljer <ArrowRight size={14} />
                    </span>
                  </div>
                  {weather?.aiSummaryToday && (
                    <p className="text-sm text-muted-foreground mt-3 flex items-start gap-2">
                      <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
                      <span className="line-clamp-2">{weather.aiSummaryToday}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Værdata utilgjengelig</p>
              )}
            </Link>
          </section>

          {/* Navigation – clean text list */}
          <nav className="space-y-0">
            <NavRow to="/chat" label="Chat" detail={unreadCount > 0 ? `${unreadCount} uleste` : undefined} />
            <NavRow to="/vaer" label="Vær" detail="Yr · MeteoSwiss" />
            <NavRow to="/live" label="Live" detail="Radar & webcams" />
            <NavRow to="/kart" label="Løypekart" />
            <NavRow to="/mer" label="Mer" />
          </nav>
        </div>
      </div>
    </div>
  );
};

interface NavRowProps {
  to: string;
  label: string;
  detail?: string;
}

const NavRow: React.FC<NavRowProps> = ({ to, label, detail }) => (
  <Link
    to={to}
    className="flex items-center justify-between py-4 border-b border-border group active:bg-muted/50 transition-colors"
  >
    <span className="font-heading text-lg font-semibold text-foreground">{label}</span>
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      {detail && <span>{detail}</span>}
      <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
    </span>
  </Link>
);

export default HomeScreen;
