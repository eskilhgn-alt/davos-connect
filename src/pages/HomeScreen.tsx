/**
 * HomeScreen — aktiv tur, nedtelling, neste aktivitet og kompakte innganger.
 * Alle snarveier samles på samme scrollflate uten fast bunnmeny.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { HomeDashboard, type HomeDashboardHandle } from "@/components/home/HomeDashboard";
import { EmergencyInfoSheet } from "@/components/home/EmergencyInfoSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useAppBadges } from "@/hooks/useAppBadges";
import { useTrip } from "@/contexts/TripContext";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { MoreTiles } from "@/pages/MoreScreen";
import { TripSwitcher } from "@/components/trip/TripSwitcher";
import { formatTripDateRange, daysUntilTripStart, tripPhase } from "@/features/trip/tripDates";

import {
  MessageCircle,
  CloudSun,
  Camera,
  Map as MapIcon,
  CalendarDays,
  Compass,
  LogOut,
  AlertTriangle,
  MapPin,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TileItem {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export const HomeScreen: React.FC = () => {
  const { signOut } = useAuth();
  const badges = useAppBadges();
  const { refreshTrip, selectedTrip, isArchive } = useTrip();
  const dashboardRef = React.useRef<HomeDashboardHandle>(null);
  const [emergencyOpen, setEmergencyOpen] = React.useState(false);

  // Bruk valgt tur fra TripContext (ingen hardkodet ACTIVE_TRIP).
  const tripName = selectedTrip?.name ?? "Ingen tur valgt";
  const tripDestination = selectedTrip?.destination ?? "";
  // Datoer tolkes alltid i turens tidssone (aldri new Date("YYYY-MM-DD")).
  const dateLabel = formatTripDateRange(selectedTrip);
  const phase = tripPhase(selectedTrip);
  const daysUntil = daysUntilTripStart(selectedTrip);

  const primaryTiles: TileItem[] = React.useMemo(
    () => [
      { to: "/chat", label: "Chat", icon: MessageCircle, badge: badges.chat },
      { to: "/kart", label: "Kart", icon: MapIcon },
      { to: "/vaer", label: "Vær", icon: CloudSun },
      { to: "/webcams", label: "Webkamera", icon: Camera },
      { to: "/agenda", label: "Agenda", icon: CalendarDays, badge: badges.agenda },
      { to: "/oppdag", label: "Oppdag", icon: Compass },
    ],
    [badges],
  );

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="GüttaHütte"
        rightAction={
          <button
            onClick={() => signOut()}
            className="tap-target flex items-center justify-center text-muted-foreground"
            aria-label="Logg ut"
          >
            <LogOut size={18} strokeWidth={1.8} />
          </button>
        }
      />

      <PullToRefreshWrapper
        onRefresh={async () => {
          // Koordinert refresh: turfølsomme queries + dashboard uten remount.
          await Promise.allSettled([
            refreshTrip(),
            dashboardRef.current?.refresh() ?? Promise.resolve(),
          ]);
        }}


        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="px-4 pt-4 space-y-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
        >
          {/* Active trip card */}
          <section
            aria-label="Aktiv tur"
            className="rounded-2xl border border-border bg-muted/40 p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <MapPin size={11} />
                <span>Aktiv tur</span>
              </div>
              <h2 className="font-heading text-lg font-bold text-foreground leading-tight mt-0.5 truncate">
                {tripName}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {tripDestination ? `${tripDestination} · ${dateLabel}` : dateLabel}
                {isArchive ? " · Arkiv" : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {phase === "upcoming" && daysUntil !== null ? (
                <>
                  <div className="font-heading text-2xl font-bold text-foreground leading-none">
                    {daysUntil}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    dager igjen
                  </div>
                </>
              ) : phase === "ongoing" ? (
                <div className="text-[10px] uppercase tracking-wider text-primary max-w-[6rem]">
                  Turen pågår
                </div>
              ) : phase === "ended" ? (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground max-w-[6rem]">
                  Turen er ferdig
                </div>
              ) : (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground max-w-[6rem]">
                  Nedtelling starter når datoene er satt
                </div>
              )}
            </div>
          </section>

          {/* Stories ligger i Chat (CHAT-MEDIA-01) */}
          <Link
            to="/chat?panel=stories"
            className="flex items-center gap-3 min-h-12 px-4 rounded-2xl border border-border bg-muted/40 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
          >
            <Sparkles size={18} aria-hidden />
            <span className="flex-1">Stories i Chat</span>
          </Link>

          {/* Mini dashboard: valuta, neste event, vær */}
          <HomeDashboard ref={dashboardRef} />

          {/* Kompakte innganger */}
          <nav aria-label="Snarveier" className="grid grid-cols-3 gap-2.5">
            {primaryTiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2",
                  "aspect-square rounded-2xl bg-muted/50 border border-border",
                  "active:scale-[0.97] transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <tile.icon size={24} strokeWidth={1.6} className="text-foreground" />
                <span className="font-heading text-xs font-semibold text-foreground text-center leading-tight px-1 break-words max-w-full">
                  {tile.label}
                </span>
                {tile.badge && tile.badge > 0 ? (
                  <span className="absolute top-2 right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1 leading-none">
                    {tile.badge > 99 ? "99+" : tile.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="border-t border-border pt-5 space-y-5">
            <MoreTiles excludePaths={["/agenda", "/oppdag"]} />
            <TripSwitcher />
          </div>

          <button
            onClick={() => setEmergencyOpen(true)}
            className="w-full min-h-11 flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <AlertTriangle size={13} />
            <span>Nødinfo & viktige numre</span>
          </button>
        </div>
      </PullToRefreshWrapper>

      <EmergencyInfoSheet open={emergencyOpen} onOpenChange={setEmergencyOpen} />
    </div>
  );
};

export default HomeScreen;
