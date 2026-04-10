/**
 * UserStatsSheet – Bottom sheet with comprehensive user statistics
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Trophy,
  Target,
  Flame,
  Mountain,
  Gauge,
  MessageCircle,
  Camera,
  Ticket,
  Ban,
  Eye,
  Beer,
  Percent,
  Coins,
  Crown,
} from "lucide-react";

export interface UserStats {
  user_id: string;
  display_name: string;
  total_points: number;
  current_streak: number;
  best_streak: number;
  token_balance: number;
  shots_selected: number;
  shots_confirmed: number;
  shots_punished: number;
  shots_refused: number;
  rounds_started: number;
  times_witnessed: number;
  ski_total_vertical: number;
  ski_active_days: number;
  ski_today_vertical: number;
  frikort_earned: number;
  frikort_used: number;
  frikort_available: number;
  messages_sent: number;
  media_shared: number;
  stories_posted: number;
  shot_success_rate: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  stats: UserStats | null;
  avatarUrl?: string | null;
  isCreator?: boolean;
  joinedDate?: string;
  topSpeed?: number | null;
}

const StatCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}> = ({ icon, label, value, highlight }) => (
  <div
    className={cn(
      "flex flex-col items-center p-2.5 rounded-xl bg-muted/50 border border-border",
      highlight && "border-destructive/30 bg-destructive/5"
    )}
  >
    <span className="text-muted-foreground mb-1">{icon}</span>
    <span
      className={cn(
        "text-sm font-bold tabular-nums leading-none",
        highlight ? "text-destructive" : "text-foreground"
      )}
    >
      {value}
    </span>
    <span className="text-[9px] text-muted-foreground mt-1">{label}</span>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="font-heading text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2 px-1">
    {children}
  </h3>
);

export const UserStatsSheet: React.FC<Props> = ({
  open,
  onClose,
  stats,
  avatarUrl,
  isCreator,
  joinedDate,
  topSpeed,
}) => {
  if (!stats) return null;

  const initials = stats.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3">
            <DavosAvatar
              src={avatarUrl || undefined}
              fallback={initials}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-left flex items-center gap-2">
                {stats.display_name}
                {isCreator && (
                  <DavosBadge variant="accent" className="flex items-center gap-1">
                    <Crown size={10} />
                    Grunnlegger
                  </DavosBadge>
                )}
              </DrawerTitle>
              {joinedDate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ble med{" "}
                  {new Date(joinedDate).toLocaleDateString("nb-NO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto">
          {/* Points & Streak */}
          <SectionTitle>Poeng & Streak</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            <StatCell icon={<Trophy size={14} />} label="Poeng" value={stats.total_points} />
            <StatCell icon={<Flame size={14} />} label="Streak" value={`${stats.current_streak}d`} />
            <StatCell icon={<Flame size={14} />} label="Beste" value={`${stats.best_streak}d`} />
            <StatCell icon={<Coins size={14} />} label="Tokens" value={stats.token_balance} />
          </div>

          {/* Shot stats */}
          <SectionTitle>Shoot Your Shot</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            <StatCell icon={<Target size={14} />} label="Trukket" value={stats.shots_selected} />
            <StatCell icon={<Target size={14} />} label="Tatt" value={stats.shots_confirmed} />
            <StatCell
              icon={<Ban size={14} />}
              label="Straffet"
              value={stats.shots_punished}
              highlight={stats.shots_punished > 0}
            />
            <StatCell
              icon={<Ban size={14} />}
              label="Nektet"
              value={stats.shots_refused}
              highlight={stats.shots_refused > 0}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <StatCell icon={<Percent size={14} />} label="Suksessrate" value={`${stats.shot_success_rate}%`} />
            <StatCell icon={<Eye size={14} />} label="Vitnet" value={stats.times_witnessed} />
            <StatCell icon={<Beer size={14} />} label="Startet" value={stats.rounds_started} />
          </div>

          {/* Frikort */}
          <SectionTitle>Frikort</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <StatCell icon={<Ticket size={14} />} label="Opptjent" value={stats.frikort_earned} />
            <StatCell icon={<Ticket size={14} />} label="Brukt" value={stats.frikort_used} />
            <StatCell icon={<Ticket size={14} />} label="Tilgjengelig" value={stats.frikort_available} />
          </div>

          {/* Ski */}
          <SectionTitle>Ski</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            <StatCell
              icon={<Mountain size={14} />}
              label="Hm totalt"
              value={`${Math.round(stats.ski_total_vertical)}m`}
            />
            <StatCell
              icon={<Mountain size={14} />}
              label="Hm i dag"
              value={`${Math.round(stats.ski_today_vertical)}m`}
            />
            <StatCell icon={<Gauge size={14} />} label="Ski-dager" value={stats.ski_active_days} />
            <StatCell
              icon={<Gauge size={14} />}
              label="Toppfart"
              value={topSpeed ? `${Math.round(topSpeed)} km/t` : "–"}
            />
          </div>

          {/* Social */}
          <SectionTitle>Sosial</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <StatCell icon={<MessageCircle size={14} />} label="Meldinger" value={stats.messages_sent} />
            <StatCell icon={<Camera size={14} />} label="Media" value={stats.media_shared} />
            <StatCell icon={<Camera size={14} />} label="Stories" value={stats.stories_posted} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
