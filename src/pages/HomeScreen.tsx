/**
 * HomeScreen — aktiv tur, nedtelling, neste aktivitet og kompakte innganger.
 * Detaljerte snarveier (agenda, avstemninger, admin, spill osv.) ligger i «Mer».
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AppHeader } from "@/components/layout/AppHeader";
import { HomeDashboard, type HomeDashboardHandle } from "@/components/home/HomeDashboard";
import { StoryRing } from "@/components/stories/StoryRing";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { EmergencyInfoSheet } from "@/components/home/EmergencyInfoSheet";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/contexts/AuthContext";
import { useAppBadges } from "@/hooks/useAppBadges";
import { useTrip } from "@/contexts/TripContext";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";

import {
  MessageCircle,
  CloudSun,
  Camera,
  Map as MapIcon,
  CalendarDays,
  MoreHorizontal,
  LogOut,
  AlertTriangle,
  MapPin,
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
  const { refreshTrip, selectedTrip, selectedTripId, isArchive } = useTrip();
  const { groups, loading: storiesLoading, refetch: refetchStories, markViewed } = useStories(selectedTripId, isArchive);
  const dashboardRef = React.useRef<HomeDashboardHandle>(null);

  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = React.useState(0);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [emergencyOpen, setEmergencyOpen] = React.useState(false);

  const openStory = (groupIndex: number) => {
    setViewerGroupIdx(groupIndex);
    setViewerOpen(true);
  };

  // Bruk valgt tur fra TripContext (ingen hardkodet ACTIVE_TRIP).
  const tripName = selectedTrip?.name ?? "Ingen tur valgt";
  const tripDestination = selectedTrip?.destination ?? "";
  const startDate = selectedTrip?.start_date ?? null;
  const endDate = selectedTrip?.end_date ?? null;
  const hasDates = !!startDate && !!endDate;
  const dateLabel = hasDates
    ? `${format(new Date(startDate!), "d. MMM", { locale: nb })} – ${format(new Date(endDate!), "d. MMM yyyy", { locale: nb })}`
    : "Datoer ikke satt";
  const daysUntil = hasDates
    ? Math.max(0, Math.ceil((new Date(startDate!).getTime() - Date.now()) / 86_400_000))
    : null;

  const primaryTiles: TileItem[] = React.useMemo(
    () => [
      { to: "/chat", label: "Chat", icon: MessageCircle, badge: badges.chat },
      { to: "/kart", label: "Kart", icon: MapIcon },
      { to: "/vaer", label: "Vær", icon: CloudSun },
      { to: "/webcams", label: "Webkamera", icon: Camera },
      { to: "/agenda", label: "Agenda", icon: CalendarDays, badge: badges.agenda },
      { to: "/mer", label: "Mer", icon: MoreHorizontal },
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
          // Koordinert refresh: turfølsomme queries + stories + dashboard uten remount.
          await Promise.allSettled([
            refreshTrip(),
            refetchStories(),
            dashboardRef.current?.refresh() ?? Promise.resolve(),
          ]);
        }}


        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="px-4 pt-4 space-y-5"
          style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 24px)" }}
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
              {daysUntil !== null && daysUntil >= 0 ? (
                <>
                  <div className="font-heading text-2xl font-bold text-foreground leading-none">
                    {daysUntil}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    dager igjen
                  </div>
                </>
              ) : (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground max-w-[6rem]">
                  Nedtelling starter når datoene er satt
                </div>
              )}
            </div>
          </section>

          {/* Stories */}
          <StoryRing
            groups={groups}
            loading={storiesLoading}
            onAddStory={() => setCaptureOpen(true)}
            onOpenStory={openStory}
          />

          {/* Mini dashboard: valuta, neste event, vær */}
          <HomeDashboard ref={dashboardRef} />

          {/* Kompakte innganger */}
          <nav className="grid grid-cols-3 gap-2.5">
            {primaryTiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2",
                  "aspect-square rounded-2xl bg-muted/50 border border-border",
                  "active:scale-[0.97] transition-all duration-150 hover:bg-muted",
                )}
              >
                <tile.icon size={24} strokeWidth={1.6} className="text-foreground" />
                <span className="font-heading text-[11px] font-semibold text-foreground text-center leading-tight px-1">
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

          <button
            onClick={() => setEmergencyOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <AlertTriangle size={13} />
            <span>Nødinfo & viktige numre</span>
          </button>
        </div>
      </PullToRefreshWrapper>

      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIdx}
          onClose={() => {
            setViewerOpen(false);
            refetchStories();
          }}
          onViewed={markViewed}
        />
      )}

      {captureOpen && (
        <StoryCapture
          onClose={() => setCaptureOpen(false)}
          onPublished={() => {
            setCaptureOpen(false);
            refetchStories();
          }}
        />
      )}

      <EmergencyInfoSheet open={emergencyOpen} onOpenChange={setEmergencyOpen} />
    </div>
  );
};

export default HomeScreen;
