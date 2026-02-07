/**
 * HomeScreen – Tile-based navigation hub (iOS-first, minimalist)
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import {
  MessageCircle,
  CloudSun,
  Radio,
  Map,
  Target,
  Settings,
  Users,
  Bell,
  ShieldCheck,
  CalendarDays,
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

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 10) return "God morgen";
    if (hour < 17) return "Hei";
    return "God kveld";
  }, []);

  const displayName = profile?.nickname || profile?.full_name?.split(" ")[0] || "";

  const tiles: TileItem[] = React.useMemo(() => {
    const base: TileItem[] = [
      { to: "/chat", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: "/vaer", label: "Vær", icon: CloudSun },
      { to: "/live", label: "Live", icon: Radio },
      { to: "/kart", label: "Løypekart", icon: Map },
      { to: "/shot", label: "Shoot", icon: Target },
      { to: "/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/gruppe", label: "Gruppen", icon: Users },
      { to: "/varsler", label: "Varsler", icon: Bell },
      { to: "/info", label: "Info", icon: Settings },
    ];
    if (isAdmin) {
      base.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
    }
    return base;
  }, [unreadCount, isAdmin]);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Lift & Lager" />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="px-4 pt-8 pb-10 space-y-8">
          {/* Greeting */}
          <section className="px-2">
            <h1 className="font-heading text-3xl font-bold text-foreground leading-tight">
              {greeting},<br />{displayName}
            </h1>
          </section>

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
    </div>
  );
};

export default HomeScreen;
