/**
 * MoreScreen — "Mer"-fane. Samler alt som ikke er Hjem, Chat eller Kart:
 * agenda, avstemninger, galleri/stories, innstillinger, admin,
 * og en lavt prioritert seksjon for valgfrie verktøy.
 */

import * as React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useAuth } from "@/contexts/AuthContext";
import { useAppBadges } from "@/hooks/useAppBadges";
import {
  CalendarDays,
  Compass,
  Vote,
  Film,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
  Beer,
  Sparkles,
  AlertTriangle,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmergencyInfoSheet } from "@/components/home/EmergencyInfoSheet";
import { TripSwitcher } from "@/components/trip/TripSwitcher";

interface Tile {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface Section {
  title: string;
  subtitle?: string;
  tiles: Tile[];
  /** Rendered slightly de-emphasised. */
  quiet?: boolean;
}

const MoreScreen: React.FC = () => {
  const { isAdmin, signOut } = useAuth();
  const badges = useAppBadges();
  const [emergencyOpen, setEmergencyOpen] = React.useState(false);

  const sections: Section[] = React.useMemo(() => {
    const planning: Tile[] = [
      { to: "/agenda", label: "Agenda", icon: CalendarDays, badge: badges.agenda },
      { to: "/oppdag", label: "Oppdag", icon: Compass },
      { to: "/poll", label: "Avstemninger", icon: Vote, badge: badges.polls },
      { to: "/runder", label: "Runder", icon: Beer, badge: badges.runder },
    ];

    const community: Tile[] = [
      { to: "/galleri", label: "Galleri", icon: Film },
      { to: "/historier", label: "Historier", icon: Sparkles },
      { to: "/alle", label: "Gütta", icon: Users },
    ];

    const funAndGames: Tile[] = [
      { to: "/faktasjekker", label: "Faktasjekk", icon: Sparkles },
    ];

    const settingsTiles: Tile[] = [
      { to: "/innstillinger", label: "Innstillinger", icon: Settings },
    ];
    if (isAdmin) {
      settingsTiles.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
    }

    return [
      { title: "Planlegging", tiles: planning },
      { title: "Fellesskap", tiles: community },
      { title: "Fest og spill", subtitle: "Helt frivillig", tiles: funAndGames, quiet: true },
      { title: "Konto", tiles: settingsTiles },
    ];
  }, [badges, isAdmin]);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Mer"
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
        onRefresh={async () => {}}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="px-4 pt-4 space-y-6"
          style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 32px)" }}
        >
          <TripSwitcher />

          {sections.map((section) => (
            <section key={section.title} className={cn(section.quiet && "opacity-95")}>
              <div className="mb-2">
                <h2 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h2>
                {section.subtitle && (
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{section.subtitle}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {section.tiles.map((tile) => (
                  <Link
                    key={tile.to}
                    to={tile.to}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-2",
                      "aspect-square rounded-2xl border",
                      section.quiet
                        ? "bg-muted/30 border-border/70"
                        : "bg-muted/50 border-border",
                      "active:scale-[0.97] transition-all duration-150 hover:bg-muted",
                    )}
                  >
                    <tile.icon size={22} strokeWidth={1.6} className="text-foreground" />
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
              </div>
            </section>
          ))}

          <button
            onClick={() => setEmergencyOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
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

export default MoreScreen;
