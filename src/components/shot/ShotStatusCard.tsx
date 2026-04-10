/**
 * ShotStatusCard – Shows current round status
 * Simplified: direct confirm, no witness, no bans
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShotEvent } from "@/pages/ShotScreen";
import { Check, Clock, Ticket, Skull, Users } from "lucide-react";

interface ShotStatusCardProps {
  event: ShotEvent;
  currentUserId: string;
  isAdmin?: boolean;
  getDisplayName: (id: string | null) => string;
  onConfirm: (mode: string) => void;
  onUseFrikort?: () => void;
  hasFrikort?: boolean;
  profiles: Record<string, string>;
}

export const ShotStatusCard: React.FC<ShotStatusCardProps> = ({
  event, currentUserId, isAdmin, getDisplayName, onConfirm, onUseFrikort, hasFrikort, profiles,
}) => {
  const [timeLeft, setTimeLeft] = React.useState("");

  const isMonster = !!event.monster_round_id;

  // Deadline countdown
  React.useEffect(() => {
    if (event.status !== "selected" || !event.deadline_at) return;
    const tick = () => {
      const remaining = Math.max(0, new Date(event.deadline_at!).getTime() - Date.now());
      if (remaining <= 0) { setTimeLeft("Tiden er ute!"); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s igjen`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.status, event.deadline_at]);

  const isSelected = event.status === "selected";
  const isConfirmed = event.status === "confirmed";
  const isWinner = event.selected_user_id === currentUserId;
  const winnerName = getDisplayName(event.selected_user_id);
  const starterName = getDisplayName(event.started_by);

  return (
    <div className={cn("border rounded-xl p-5 space-y-4", isMonster ? "border-destructive/40 bg-destructive/5" : "border-border")}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isMonster && <span className="text-destructive font-bold mr-1">🔥 MONSTERRUNDE</span>}
          Startet av {starterName}
        </p>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full",
          isConfirmed ? "bg-success/10 text-success" :
          event.status === "punished" ? "bg-destructive/10 text-destructive" :
          "bg-muted text-muted-foreground"
        )}>
          {isSelected && "Aktiv"}
          {isConfirmed && "Bekreftet ✅"}
          {event.status === "punished" && "Ikke tatt 💀"}
          {event.status === "countdown" && "Nedtelling"}
        </span>
      </div>

      {/* Countdown state */}
      {event.status === "countdown" && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">Nedtelling pågår – vinner trekkes snart!</p>
        </div>
      )}

      {/* Winner display */}
      {event.selected_user_id && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-1">Trukket</p>
          <p className="font-heading text-2xl font-bold text-foreground">{winnerName}</p>
          {isSelected && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mt-2">
              <Clock size={14} /> {timeLeft}
            </p>
          )}
        </div>
      )}

      {/* Direct confirm button for selected user */}
      {isSelected && isWinner && !event.self_confirmed && (
        <div className="space-y-3">
          <button type="button" onClick={() => onConfirm("direct")}
            className={cn("w-full flex items-center justify-center gap-2 py-4 rounded-xl font-heading font-bold text-lg transition-all active:scale-[0.97]",
              "bg-foreground text-background")}>
            <Check size={20} /> Shot tatt! ✅
          </button>
          {hasFrikort && onUseFrikort && !isMonster && (
            <button type="button" onClick={onUseFrikort}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-foreground/20 bg-muted/50 text-foreground text-sm font-medium transition-all active:scale-[0.98]">
              <Ticket size={16} /> Bruk frikort (stå over)
            </button>
          )}
        </div>
      )}

      {/* Punished */}
      {event.status === "punished" && (
        <div className="text-center py-2">
          <p className="text-sm text-destructive font-medium">💀 Shotten ble ikke tatt</p>
        </div>
      )}

      {/* Confirmed indicator */}
      {isConfirmed && (
        <div className="flex items-center justify-center gap-2 text-sm text-success">
          <Check size={14} />
          <span>{winnerName} har bekreftet</span>
        </div>
      )}
    </div>
  );
};
