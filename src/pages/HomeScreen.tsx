/**
 * HomeScreen - Landing page after login
 * Sleek, minimal with shortcuts and status cards
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { getBackendWeather, type WeatherWithQuote } from "@/services/weather-backend.service";
import { getWeatherIcon } from "@/services/weather.service";
import { 
  MessageCircle, 
  CloudSun, 
  Radio, 
  Map, 
  
  Sparkles,
  Wind,
  Snowflake
} from "lucide-react";

interface ShortcutProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const Shortcut: React.FC<ShortcutProps> = ({ to, icon, label, description }) => (
  <Link
    to={to}
    className="flex items-center gap-3 p-4 bg-card rounded-[var(--radius-card)] border border-border hover:bg-accent/10 active:scale-[0.98] transition-all"
  >
    <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="font-heading font-semibold text-foreground truncate">{label}</p>
      <p className="text-xs text-muted-foreground truncate">{description}</p>
    </div>
  </Link>
);

export const HomeScreen: React.FC = () => {
  const { profile } = useAuth();
  const [weather, setWeather] = React.useState<WeatherWithQuote | null>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);

  // Fetch weather summary
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
      <AppHeader title="Lift & Lager" subtitle="Davos Klosters" />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-4 space-y-6">
          {/* Welcome Section */}
          <section className="text-center py-4">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {greeting}, {displayName}! 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              Klar for en dag i bakken?
            </p>
          </section>

          {/* Weather Summary Card */}
          <section>
            <Link to="/vaer">
              <DavosCard className="overflow-hidden hover:shadow-md transition-shadow">
                <DavosCardContent className="p-4">
                  {weatherLoading ? (
                    <div className="flex items-center gap-4">
                      <DavosSkeleton variant="circular" className="h-14 w-14" />
                      <div className="space-y-2 flex-1">
                        <DavosSkeleton className="h-5 w-24" />
                        <DavosSkeleton className="h-3 w-40" />
                      </div>
                    </div>
                  ) : today ? (
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{getWeatherIcon(today.weatherCode)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-heading text-2xl font-bold text-foreground">
                            {today.tempMedian}°
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({today.tempMin}° → {today.tempMax}°)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {today.snowMedian > 0 && (
                            <span className="flex items-center gap-1">
                              <Snowflake size={12} className="text-primary" />
                              {today.snowMedian}cm
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Wind size={12} />
                            {today.windMedian}m/s
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-primary">
                        <CloudSun size={24} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-2">
                      Kunne ikke laste vær
                    </p>
                  )}
                  
                  {/* AI Summary */}
                  {weather?.aiSummaryToday && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-start gap-2">
                        <Sparkles size={14} className="text-primary mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {weather.aiSummaryToday}
                        </p>
                      </div>
                    </div>
                  )}
                </DavosCardContent>
              </DavosCard>
            </Link>
          </section>

          {/* Primary Shortcuts */}
          <section>
            <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3">
              Snarveier
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <Shortcut
                to="/chat"
                icon={<MessageCircle size={20} />}
                label="Chat"
                description="Snakk med crewet"
              />
              <Shortcut
                to="/vaer"
                icon={<CloudSun size={20} />}
                label="Vær"
                description="KI-akkumulert prognose"
              />
              <Shortcut
                to="/live"
                icon={<Radio size={20} />}
                label="Live"
                description="Radar og webcams"
              />
              <Shortcut
                to="/kart"
                icon={<Map size={20} />}
                label="Løypekart"
                description="Pistemaps og status"
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
