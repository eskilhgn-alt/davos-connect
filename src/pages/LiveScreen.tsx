import * as React from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronRight, CloudSun, Map, Snowflake } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ACTIVE_TRIP } from "@/config/trip";
import { useValThorensLive } from "@/hooks/useValThorensLive";

const LIVE_LINKS = [
  { to: "/kart", title: "Løypekart", subtitle: "Interaktivt kart med live status", icon: Map },
  { to: "/forhold", title: "Snø & åpning", subtitle: "Heiser, løyper og forbindelser", icon: Snowflake },
  { to: "/webcams", title: "Webkameraer", subtitle: "Direktebilder fra fjellet", icon: Camera },
  { to: "/vaer", title: "Fjellvær", subtitle: "Val Thorens + 7-dagers prognose", icon: CloudSun },
];

export const LiveScreen: React.FC = () => {
  const { data } = useValThorensLive();
  const weather = data?.weather?.[0];
  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Live" subtitle={ACTIVE_TRIP.destination} leftAction={<BackButton fallbackPath="/hjem" />} />
      <div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        {weather && (
          <div className="mb-4 rounded-2xl border border-border bg-muted/45 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Akkurat nå · {weather.elevationM ?? 2300} moh.</p>
              <p className="font-heading text-2xl font-bold text-foreground mt-1">{weather.afternoonTemperature || weather.morningTemperature || "–"}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Vind {weather.wind || "–"}</p>
              {weather.freshSnow && <p>Nysnø {weather.freshSnow}</p>}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {LIVE_LINKS.map((item) => (
            <Link key={item.to} to={item.to} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4 active:scale-[0.99] transition-transform">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><item.icon size={22} /></div>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
              </div>
              <ChevronRight size={17} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>

        <p className="mt-5 text-center text-[10px] text-muted-foreground/70">Live-data fra Val Thorens / Lumiplan · prognose fra Open-Meteo</p>
      </div>
    </div>
  );
};

export default LiveScreen;
