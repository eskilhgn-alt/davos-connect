/**
 * ShotStatusCard – Shows current round status: selected user, deadline, confirm buttons
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShotEvent } from "@/pages/ShotScreen";
import { Check, Eye, AlertTriangle, Clock } from "lucide-react";

interface ShotStatusCardProps {
  event: ShotEvent;
  currentUserId: string;
  getDisplayName: (id: string | null) => string;
  onConfirm: (mode: "self" | "witness") => void;
}

export const ShotStatusCard: React.FC<ShotStatusCardProps> = ({
  event,
  currentUserId,
  getDisplayName,
  onConfirm,
}) => {
  const [timeLeft, setTimeLeft] = React.useState("");

  // Deadline countdown
  React.useEffect(() => {
    if (event.status !== "selected" || !event.deadline_at) return;

    const tick = () => {
      const remaining = Math.max(0, new Date(event.deadline_at!).getTime() - Date.now());
      if (remaining <= 0) {
        setTimeLeft("Tiden er ute!");
        return;
      }
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      setTimeLeft(`${hours}t ${mins}m igjen`);
    };

    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [event.status, event.deadline_at]);

  const isSelected = event.status === "selected";
  const isConfirmed = event.status === "confirmed";
  const isPunished = event.status === "punished";
  const isWinner = event.selected_user_id === currentUserId;
  const winnerName = getDisplayName(event.selected_user_id);
  const starterName = getDisplayName(event.started_by);

  return (
    <div className="border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Startet av {starterName}
        </p>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full",
          isConfirmed ? "bg-success/10 text-success" :
          isPunished ? "bg-destructive/10 text-destructive" :
          "bg-muted text-muted-foreground"
        )}>
          {isSelected && "Aktiv"}
          {isConfirmed && (event.witness_confirmed_by ? "Bekreftet ✓" : "Ubekreftet")}
          {isPunished && "Straff!"}
          {event.status === "countdown" && "Nedtelling"}
        </span>
      </div>

      {/* Winner display */}
      {event.selected_user_id && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-1">
            {isPunished ? "Straffet" : "Trukket"}
          </p>
          <p className="font-heading text-2xl font-bold text-foreground">
            {winnerName}
          </p>
          {isSelected && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mt-2">
              <Clock size={14} />
              {timeLeft}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isSelected && !event.self_confirmed && isWinner && (
        <button
          type="button"
          onClick={() => onConfirm("self")}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-foreground text-background font-heading font-semibold transition-all active:scale-[0.98]"
        >
          <Check size={18} />
          Shot tatt!
        </button>
      )}

      {(isSelected || isConfirmed) && event.self_confirmed && !event.witness_confirmed_by && !isWinner && (
        <button
          type="button"
          onClick={() => onConfirm("witness")}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-foreground text-foreground font-heading font-semibold transition-all active:scale-[0.98]"
        >
          <Eye size={18} />
          Bekreft som vitne
        </button>
      )}

      {/* Status indicators */}
      {event.self_confirmed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check size={14} className="text-success" />
          <span>{winnerName} har bekreftet</span>
        </div>
      )}
      {event.witness_confirmed_by && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye size={14} className="text-success" />
          <span>Vitne: {getDisplayName(event.witness_confirmed_by)}</span>
        </div>
      )}
      {isPunished && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle size={14} />
          <span>Straffeshot registrert</span>
        </div>
      )}
    </div>
  );
};
