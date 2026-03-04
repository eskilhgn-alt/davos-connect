/**
 * UserStatsSheet – Bottom sheet with user statistics (simplified - no ski/tokens/points)
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import {
  Target, MessageCircle, Camera, Ban, Eye, Beer, Percent, Crown,
} from "lucide-react";

export interface UserStats {
  user_id: string;
  display_name: string;
  shots_selected: number;
  shots_confirmed: number;
  shots_punished: number;
  shots_refused: number;
  rounds_started: number;
  times_witnessed: number;
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
}

const StatCell: React.FC<{
  icon: React.ReactNode; label: string; value: string | number; highlight?: boolean;
}> = ({ icon, label, value, highlight }) => (
  <div className={cn("flex flex-col items-center p-2.5 rounded-xl bg-muted/50 border border-border", highlight && "border-destructive/30 bg-destructive/5")}>
    <span className="text-muted-foreground mb-1">{icon}</span>
    <span className={cn("text-sm font-bold tabular-nums leading-none", highlight ? "text-destructive" : "text-foreground")}>{value}</span>
    <span className="text-[9px] text-muted-foreground mt-1">{label}</span>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="font-heading text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2 px-1">{children}</h3>
);

export const UserStatsSheet: React.FC<Props> = ({ open, onClose, stats, avatarUrl, isCreator, joinedDate }) => {
  if (!stats) return null;

  const initials = stats.display_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3">
            <DavosAvatar src={avatarUrl || undefined} fallback={initials} size="lg" />
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-left flex items-center gap-2">
                {stats.display_name}
                {isCreator && <DavosBadge variant="accent" className="flex items-center gap-1"><Crown size={10} /> Grunnlegger</DavosBadge>}
              </DrawerTitle>
              {joinedDate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ble med {new Date(joinedDate).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto">
          {/* Shot stats */}
          <SectionTitle>Shot</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            <StatCell icon={<Target size={14} />} label="Trukket" value={stats.shots_selected} />
            <StatCell icon={<Target size={14} />} label="Tatt" value={stats.shots_confirmed} />
            <StatCell icon={<Ban size={14} />} label="Straffet" value={stats.shots_punished} highlight={stats.shots_punished > 0} />
            <StatCell icon={<Ban size={14} />} label="Nektet" value={stats.shots_refused} highlight={stats.shots_refused > 0} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <StatCell icon={<Percent size={14} />} label="Suksessrate" value={`${stats.shot_success_rate}%`} />
            <StatCell icon={<Eye size={14} />} label="Vitnet" value={stats.times_witnessed} />
            <StatCell icon={<Beer size={14} />} label="Startet" value={stats.rounds_started} />
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