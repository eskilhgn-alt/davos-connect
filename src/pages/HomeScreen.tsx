/**
 * HomeScreen – Tile-based navigation hub
 * Base functions only – gamification removed
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { StoryRing } from "@/components/stories/StoryRing";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/contexts/AuthContext";
import { useAppBadges } from "@/hooks/useAppBadges";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import {
  MessageCircle,
  CloudSun,
  Radio,
  Map,
  MapPin,
  Target,
  Settings,
  ShieldCheck,
  CalendarDays,
  Film,
  Sparkles,
  LogOut,
  Beer,
  Vote,
  Users,
  Home,
  Trophy,
  BookOpen,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TileItem {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export const HomeScreen: React.FC = () => {
  const { profile, isAdmin, signOut } = useAuth();
  const badges = useAppBadges();
  const { groups, loading: storiesLoading, refetch: refetchStories, markViewed } = useStories();

  const [refreshKey, setRefreshKey] = React.useState(0);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = React.useState(0);
  const [captureOpen, setCaptureOpen] = React.useState(false);

  const openStory = (groupIndex: number) => {
    setViewerGroupIdx(groupIndex);
    setViewerOpen(true);
  };

  const tiles: TileItem[] = React.useMemo(() => {
    const base: TileItem[] = [
      { to: "/chat", label: "Chat", icon: MessageCircle, badge: badges.chat },
      { to: "/vaer", label: "Vær", icon: CloudSun },
      { to: "/live", label: "Live", icon: Radio },
      { to: "/kart", label: "Løypekart", icon: Map },
      { to: "/agenda", label: "Agenda", icon: CalendarDays, badge: badges.agenda },
      { to: "/magnus", label: "Magnus?", icon: MapPin },
      { to: "/shot", label: "Shoot", icon: Target, badge: badges.shot },
      { to: "/poll", label: "Avstemming", icon: Vote, badge: badges.polls },
      { to: "/runder", label: "Runder", icon: Beer, badge: badges.runder },
      { to: "/roomies", label: "Roomies", icon: Home },
      { to: "/galleri", label: "Galleri", icon: Film },
      { to: "/alle", label: "Gütta", icon: Users },
      { to: "/tokens", label: "Topplister", icon: Trophy },
      { to: "/pakkeliste", label: "Pakkeliste", icon: ListChecks },
      { to: "/nodinfo", label: "Nødinfo", icon: AlertTriangle },
      { to: "/faktasjekker", label: "Faktasjekk", icon: Sparkles },
      { to: "/regler", label: "Regler", icon: BookOpen },
      { to: "/innstillinger", label: "Innstillinger", icon: Settings },
    ];
    if (isAdmin) {
      base.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
    }
    return base;
  }, [badges, isAdmin]);

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
        onRefresh={async () => { setRefreshKey((k) => k + 1); }}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="px-4 pt-4 pb-10 space-y-5">
          {/* Stories widget */}
          <StoryRing
            groups={groups}
            loading={storiesLoading}
            onAddStory={() => setCaptureOpen(true)}
            onOpenStory={openStory}
          />

          {/* Mini dashboard */}
          <HomeDashboard refreshKey={refreshKey} />

          {/* Tile grid */}
          <nav className="grid grid-cols-3 gap-2.5">
            {tiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2",
                  "aspect-square rounded-2xl",
                  "bg-muted/50 border border-border",
                  "active:scale-[0.97] transition-all duration-150",
                  "hover:bg-muted"
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
        </div>
      </PullToRefreshWrapper>
      {/* Story Viewer */}
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

      {/* Story Capture */}
      {captureOpen && (
        <StoryCapture
          onClose={() => setCaptureOpen(false)}
          onPublished={() => {
            setCaptureOpen(false);
            refetchStories();
          }}
        />
      )}
    </div>
  );
};

export default HomeScreen;
