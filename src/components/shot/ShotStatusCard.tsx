/**
 * ShotStatusCard – Shows current round status with witness picker flow
 * Flow: selected user picks witness → confirms "Shot tatt!" → chosen witness confirms
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShotEvent } from "@/pages/ShotScreen";
import { Check, Eye, AlertTriangle, Clock, ChevronDown, Ban, Ticket } from "lucide-react";

interface ShotStatusCardProps {
  event: ShotEvent;
  currentUserId: string;
  getDisplayName: (id: string | null) => string;
  onConfirm: (mode: "self" | "witness" | "refuse" | "witness_timeout" | "witness_deny", witnessId?: string) => void;
  onUseFrikort?: () => void;
  hasFrikort?: boolean;
  profiles: Record<string, string>;
}

export const ShotStatusCard: React.FC<ShotStatusCardProps> = ({
  event,
  currentUserId,
  getDisplayName,
  onConfirm,
  onUseFrikort,
  hasFrikort,
  profiles,
}) => {
  const [timeLeft, setTimeLeft] = React.useState("");
  const [selectedWitness, setSelectedWitness] = React.useState<string | null>(null);
  const [showWitnessPicker, setShowWitnessPicker] = React.useState(false);
  const [witnessTimeLeft, setWitnessTimeLeft] = React.useState<number | null>(null);

  // Deadline countdown (2h)
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
      const secs = Math.floor((remaining % 60000) / 1000);
      if (hours > 0) {
        setTimeLeft(`${hours}t ${mins}m igjen`);
      } else {
        setTimeLeft(`${mins}m ${secs}s igjen`);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.status, event.deadline_at]);

  // Witness timeout: 5 min after self_confirmed, if no witness response → punishment
  React.useEffect(() => {
    if (!event.self_confirmed || event.witness_confirmed_by || event.status !== "selected") {
      setWitnessTimeLeft(null);
      return;
    }

    const WITNESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const confirmTime = event.selected_at ? new Date(event.selected_at).getTime() : Date.now();
    const witnessDeadline = confirmTime + WITNESS_TIMEOUT_MS;

    const tick = () => {
      const remaining = Math.max(0, witnessDeadline - Date.now());
      setWitnessTimeLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        // Witness didn't respond → punishment
        onConfirm("witness_timeout");
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.self_confirmed, event.witness_confirmed_by, event.status, event.selected_at, onConfirm]);

  const isSelected = event.status === "selected";
  const isConfirmed = event.status === "confirmed";
  const isPunished = event.status === "punished";
  const isWinner = event.selected_user_id === currentUserId;
  const isChosenWitness = event.chosen_witness_id === currentUserId;
  const winnerName = getDisplayName(event.selected_user_id);
  const starterName = getDisplayName(event.started_by);

  // Available witnesses (everyone except the selected user)
  const witnessOptions = React.useMemo(() => {
    return Object.entries(profiles)
      .filter(([id]) => id !== event.selected_user_id)
      .map(([id, name]) => ({ id, name }));
  }, [profiles, event.selected_user_id]);

  const handleSelfConfirm = () => {
    if (!selectedWitness) return;
    onConfirm("self", selectedWitness);
  };

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
          {isConfirmed && "Bekreftet"}
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

      {/* Step 1: Winner picks witness and confirms (or refuses) */}
      {isSelected && !event.self_confirmed && isWinner && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Velg hvem som skal bekrefte at du tar shotten:
          </p>

          {/* Witness picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowWitnessPicker(!showWitnessPicker)}
              className="w-full flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm"
            >
              <span className={selectedWitness ? "text-foreground" : "text-muted-foreground"}>
                {selectedWitness ? getDisplayName(selectedWitness) : "Velg vitne..."}
              </span>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>

            {showWitnessPicker && (
              <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {witnessOptions.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setSelectedWitness(w.id);
                      setShowWitnessPicker(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors",
                      selectedWitness === w.id
                        ? "bg-foreground/5 font-medium"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSelfConfirm}
            disabled={!selectedWitness}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-lg font-heading font-semibold transition-all active:scale-[0.98]",
              selectedWitness
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Check size={18} />
            Shot tatt!
          </button>

          {/* Frikort button */}
          {hasFrikort && onUseFrikort && (
            <button
              type="button"
              onClick={onUseFrikort}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-foreground/20 bg-muted/50 text-foreground text-sm font-medium transition-all active:scale-[0.98]"
            >
              <Ticket size={16} />
              Bruk frikort (stå over)
            </button>
          )}

          {/* Refuse button */}
          <button
            type="button"
            onClick={() => onConfirm("refuse")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive text-destructive text-sm font-medium transition-all active:scale-[0.98]"
          >
            <Ban size={16} />
            Jeg nekter (2 straffeshots)
          </button>
        </div>
      )}

      {/* Step 2: Chosen witness sees big confirm button */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && isChosenWitness && (
        <div className="space-y-3">
          <p className="text-sm text-center text-muted-foreground">
            {winnerName} sier de har tatt shotten. Bekreft!
          </p>
          <button
            type="button"
            onClick={() => onConfirm("witness")}
            className="w-full flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-foreground text-foreground font-heading text-lg font-bold transition-all active:scale-[0.98]"
          >
            <Eye size={22} />
            Ja, jeg bekrefter!
          </button>
          <button
            type="button"
            onClick={() => onConfirm("witness_deny" as any)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive text-destructive text-sm font-medium transition-all active:scale-[0.98]"
          >
            <AlertTriangle size={16} />
            Nei, avslå (straffeshot)
          </button>
        </div>
      )}

      {/* Waiting state for non-witness users */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && !isChosenWitness && !isWinner && (
        <div className="text-center py-2 space-y-1">
          <p className="text-sm text-muted-foreground">
            Venter på at {getDisplayName(event.chosen_witness_id)} bekrefter...
          </p>
          {witnessTimeLeft !== null && witnessTimeLeft > 0 && (
            <p className="text-xs text-destructive">
              Straffeshot om {Math.floor(witnessTimeLeft / 60)}m {witnessTimeLeft % 60}s hvis vitne ikke svarer
            </p>
          )}
        </div>
      )}

      {/* Winner waiting for witness */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && isWinner && (
        <div className="text-center py-2 space-y-1">
          <p className="text-sm text-muted-foreground">
            Venter på at {getDisplayName(event.chosen_witness_id)} bekrefter...
          </p>
          {witnessTimeLeft !== null && witnessTimeLeft > 0 && (
            <p className="text-xs text-destructive">
              Straffeshot om {Math.floor(witnessTimeLeft / 60)}m {witnessTimeLeft % 60}s hvis vitne ikke svarer
            </p>
          )}
        </div>
      )}

      {/* Status indicators */}
      {event.self_confirmed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check size={14} className="text-success" />
          <span>{winnerName} har bekreftet</span>
        </div>
      )}
      {event.chosen_witness_id && !event.witness_confirmed_by && event.self_confirmed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye size={14} />
          <span>Vitne: {getDisplayName(event.chosen_witness_id)}</span>
        </div>
      )}
      {event.witness_confirmed_by && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye size={14} className="text-success" />
          <span>Bekreftet av {getDisplayName(event.witness_confirmed_by)}</span>
        </div>
      )}
      {isPunished && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle size={14} />
          <span>1 straffeshot registrert</span>
        </div>
      )}
    </div>
  );
};
