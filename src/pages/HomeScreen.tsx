/**
 * HomeScreen – Tile-based navigation hub with story rings at top
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { StoryRing } from "@/components/stories/StoryRing";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useStories } from "@/hooks/useStories";
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
  Coins,
  Sparkles,
  ImageIcon,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TileItem {
  to: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export const HomeScreen: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const unreadCount = useUnreadCount();
  const { groups, loading: storiesLoading, refetch, markViewed } = useStories();

  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = React.useState(0);
  const [captureOpen, setCaptureOpen] = React.useState(false);

  const displayName = profile?.nickname || profile?.full_name?.split(" ")[0] || "";

  const tiles: TileItem[] = React.useMemo(() => {
    const base: TileItem[] = [
      { to: "/chat", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: "/vaer", label: "Vær", icon: CloudSun },
      { to: "/live", label: "Live", icon: Radio },
      { to: "/kart", label: "Løypekart", icon: Map },
      { to: "/magnus", label: "Magnus?", icon: MapPin },
      { to: "/shot", label: "Shoot", icon: Target },
      { to: "/tokens", label: "Tokens", icon: Coins },
      { to: "/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/galleri", label: "Snap & Galleri", icon: Film },
      { to: "/faktasjekker", label: "Faktasjekk", icon: Sparkles },
      { to: "/innstillinger", label: "Innstillinger", icon: Settings },
    ];
    if (isAdmin) {
      base.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
    }
    return base;
  }, [unreadCount, isAdmin]);

  const openStory = (idx: number) => {
    setViewerGroupIdx(idx);
    setViewerOpen(true);
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="GüttaHütte"
        leftAction={
          <img
            src="/app-icon.jpeg"
            alt="App ikon"
            className="w-9 h-9 rounded-lg object-cover object-[50%_30%]"
          />
        }
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="px-4 pt-4 pb-10 space-y-5">
          {/* Story rings – Instagram/Snapchat style */}
          <StoryRing
            groups={groups}
            loading={storiesLoading}
            onAddStory={() => setCaptureOpen(true)}
            onOpenStory={openStory}
          />

          {/* Mini dashboard */}
          <HomeDashboard />

          {/* Tile grid */}
          <nav className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <Link
                key={tile.to}
                to={tile.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2.5",
                  "aspect-square rounded-2xl",
                  "bg-muted/50 border border-border",
                  "active:scale-[0.97] transition-all duration-150",
                  "hover:bg-muted"
                )}
              >
                <tile.icon size={28} strokeWidth={1.6} className="text-foreground" />
                <span className="font-heading text-sm font-semibold text-foreground">
                  {tile.label}
                </span>
                {tile.badge && tile.badge > 0 ? (
                  <span className="absolute top-3 right-3 min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold px-1.5 leading-none">
                    {tile.badge > 99 ? "99+" : tile.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* Story Viewer */}
      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIdx}
          onClose={() => {
            setViewerOpen(false);
            refetch();
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
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default HomeScreen;
