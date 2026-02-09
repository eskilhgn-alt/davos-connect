/**
 * ShotStatusCard – Shows current round status with witness picker flow
 * Now includes dispute reason dropdown for witness deny
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShotEvent } from "@/pages/ShotScreen";
import { Check, Eye, AlertTriangle, Clock, ChevronDown, Ban, Ticket, Shield } from "lucide-react";

interface ShotStatusCardProps {
  event: ShotEvent;
  currentUserId: string;
  isAdmin?: boolean;
  getDisplayName: (id: string | null) => string;
  onConfirm: (mode: string, witnessId?: string, disputeReason?: string, disputeDetails?: string) => void;
  onUseFrikort?: () => void;
  hasFrikort?: boolean;
  profiles: Record<string, string>;
}

const DENY_REASONS = [
  { value: "ikke_tatt", label: "Ikke tatt" },
  { value: "usikker", label: "Usikker" },
  { value: "feil_vitne", label: "Feil vitne" },
  { value: "annet", label: "Annet" },
];

export const ShotStatusCard: React.FC<ShotStatusCardProps> = ({
  event, currentUserId, isAdmin, getDisplayName, onConfirm, onUseFrikort, hasFrikort, profiles,
}) => {
  const [timeLeft, setTimeLeft] = React.useState("");
  const [selectedWitness, setSelectedWitness] = React.useState<string | null>(null);
  const [showWitnessPicker, setShowWitnessPicker] = React.useState(false);
  const [witnessTimeLeft, setWitnessTimeLeft] = React.useState<number | null>(null);
  const [showDenyForm, setShowDenyForm] = React.useState(false);
  const [denyReason, setDenyReason] = React.useState("");
  const [denyDetails, setDenyDetails] = React.useState("");
  const [showDenyDropdown, setShowDenyDropdown] = React.useState(false);
  const [punishmentTimeLeft, setPunishmentTimeLeft] = React.useState<number | null>(null);

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

  // Witness timeout: 15 min
  React.useEffect(() => {
    if (!event.self_confirmed || event.witness_confirmed_by || event.status !== "selected") {
      setWitnessTimeLeft(null); return;
    }
    const WITNESS_TIMEOUT_MS = 15 * 60 * 1000;
    const confirmTime = event.selected_at ? new Date(event.selected_at).getTime() : Date.now();
    const witnessDeadline = confirmTime + WITNESS_TIMEOUT_MS;
    const tick = () => {
      const remaining = Math.max(0, witnessDeadline - Date.now());
      setWitnessTimeLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) onConfirm("witness_timeout");
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.self_confirmed, event.witness_confirmed_by, event.status, event.selected_at, onConfirm]);

  // Punishment deadline countdown
  React.useEffect(() => {
    if (event.status !== "punished" || !event.punishment_deadline_at) {
      setPunishmentTimeLeft(null); return;
    }
    const tick = () => {
      const remaining = Math.max(0, new Date(event.punishment_deadline_at!).getTime() - Date.now());
      setPunishmentTimeLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.status, event.punishment_deadline_at]);

  const isSelected = event.status === "selected";
  const isConfirmed = event.status === "confirmed";
  const isPunished = event.status === "punished";
  const isDisputed = event.status === "disputed";
  const isWinner = event.selected_user_id === currentUserId;
  const isChosenWitness = event.chosen_witness_id === currentUserId;
  const winnerName = getDisplayName(event.selected_user_id);
  const starterName = getDisplayName(event.started_by);

  const witnessOptions = React.useMemo(() => {
    return Object.entries(profiles)
      .filter(([id]) => id !== event.selected_user_id)
      .map(([id, name]) => ({ id, name }));
  }, [profiles, event.selected_user_id]);

  const handleSelfConfirm = () => {
    if (!selectedWitness) return;
    onConfirm("self", selectedWitness);
  };

  const handleDenySubmit = () => {
    if (!denyReason) return;
    const reason = denyReason === "annet" ? (denyDetails || "Annet") : DENY_REASONS.find(r => r.value === denyReason)?.label || denyReason;
    onConfirm("witness_deny", undefined, reason, denyDetails || undefined);
  };

  return (
    <div className="border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Startet av {starterName}</p>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full",
          isConfirmed ? "bg-success/10 text-success" :
          isPunished ? "bg-destructive/10 text-destructive" :
          isDisputed ? "bg-warning/10 text-warning" :
          "bg-muted text-muted-foreground"
        )}>
          {isSelected && "Aktiv"}
          {isConfirmed && "Bekreftet"}
          {isPunished && "Straff!"}
          {isDisputed && "Dispute ⚠️"}
          {event.status === "countdown" && "Nedtelling"}
        </span>
      </div>

      {/* Winner display */}
      {event.selected_user_id && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-1">
            {isPunished ? "Straffet" : isDisputed ? "Disputert" : "Trukket"}
          </p>
          <p className="font-heading text-2xl font-bold text-foreground">{winnerName}</p>
          {isSelected && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mt-2">
              <Clock size={14} /> {timeLeft}
            </p>
          )}
        </div>
      )}

      {/* Step 1: Winner picks witness and confirms (or refuses) */}
      {isSelected && !event.self_confirmed && isWinner && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">Velg hvem som skal bekrefte at du tar shotten:</p>
          <div className="relative">
            <button type="button" onClick={() => setShowWitnessPicker(!showWitnessPicker)}
              className="w-full flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm">
              <span className={selectedWitness ? "text-foreground" : "text-muted-foreground"}>
                {selectedWitness ? getDisplayName(selectedWitness) : "Velg vitne..."}
              </span>
              <ChevronDown size={16} className="text-muted-foreground" />
            </button>
            {showWitnessPicker && (
              <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {witnessOptions.map(w => (
                  <button key={w.id} type="button"
                    onClick={() => { setSelectedWitness(w.id); setShowWitnessPicker(false); }}
                    className={cn("w-full text-left px-4 py-2.5 text-sm transition-colors",
                      selectedWitness === w.id ? "bg-foreground/5 font-medium" : "hover:bg-muted/50")}>
                    {w.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={handleSelfConfirm} disabled={!selectedWitness}
            className={cn("w-full flex items-center justify-center gap-2 py-3 rounded-lg font-heading font-semibold transition-all active:scale-[0.98]",
              selectedWitness ? "bg-foreground text-background" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            <Check size={18} /> Shot tatt!
          </button>
          {hasFrikort && onUseFrikort && (
            <button type="button" onClick={onUseFrikort}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-foreground/20 bg-muted/50 text-foreground text-sm font-medium transition-all active:scale-[0.98]">
              <Ticket size={16} /> Bruk frikort (stå over)
            </button>
          )}
          <button type="button" onClick={() => onConfirm("refuse")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive text-destructive text-sm font-medium transition-all active:scale-[0.98]">
            <Ban size={16} /> Jeg nekter (2 straffeshots)
          </button>
        </div>
      )}

      {/* Step 2: Chosen witness - confirm or deny with reason */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && isChosenWitness && (
        <div className="space-y-3">
          <p className="text-sm text-center text-muted-foreground">{winnerName} sier de har tatt shotten. Bekreft!</p>
          
          {!showDenyForm ? (
            <>
              <button type="button" onClick={() => onConfirm("witness")}
                className="w-full flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-foreground text-foreground font-heading text-lg font-bold transition-all active:scale-[0.98]">
                <Eye size={22} /> Ja, jeg bekrefter!
              </button>
              <button type="button" onClick={() => setShowDenyForm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive text-destructive text-sm font-medium transition-all active:scale-[0.98]">
                <AlertTriangle size={16} /> Nei, avslå
              </button>
            </>
          ) : (
            <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
              <p className="text-sm font-semibold text-foreground">Hvorfor avslår du?</p>
              <div className="relative">
                <button type="button" onClick={() => setShowDenyDropdown(!showDenyDropdown)}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg border border-border bg-background text-sm">
                  <span className={denyReason ? "text-foreground" : "text-muted-foreground"}>
                    {denyReason ? DENY_REASONS.find(r => r.value === denyReason)?.label : "Velg årsak..."}
                  </span>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
                {showDenyDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
                    {DENY_REASONS.map(r => (
                      <button key={r.value} type="button"
                        onClick={() => { setDenyReason(r.value); setShowDenyDropdown(false); }}
                        className={cn("w-full text-left px-3 py-2 text-sm", denyReason === r.value ? "bg-foreground/5" : "hover:bg-muted/50")}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {denyReason === "annet" && (
                <input type="text" placeholder="Beskriv årsaken..." value={denyDetails}
                  onChange={e => setDenyDetails(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground" />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowDenyForm(false); setDenyReason(""); }}
                  className="flex-1 py-2 rounded-lg border border-border text-sm">Avbryt</button>
                <button type="button" onClick={handleDenySubmit} disabled={!denyReason}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-semibold",
                    denyReason ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                  Send dispute
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Sendes til admin – ingen automatisk straff</p>
            </div>
          )}
        </div>
      )}

      {/* Waiting state for non-witness users */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && !isChosenWitness && !isWinner && (
        <div className="text-center py-2 space-y-1">
          <p className="text-sm text-muted-foreground">Venter på at {getDisplayName(event.chosen_witness_id)} bekrefter...</p>
          {witnessTimeLeft !== null && witnessTimeLeft > 0 && (
            <p className="text-xs text-destructive">Straffeshot om {Math.floor(witnessTimeLeft / 60)}m {witnessTimeLeft % 60}s hvis vitne ikke svarer</p>
          )}
        </div>
      )}

      {/* Winner waiting for witness */}
      {isSelected && event.self_confirmed && !event.witness_confirmed_by && isWinner && (
        <div className="text-center py-2 space-y-1">
          <p className="text-sm text-muted-foreground">Venter på at {getDisplayName(event.chosen_witness_id)} bekrefter...</p>
          {witnessTimeLeft !== null && witnessTimeLeft > 0 && (
            <p className="text-xs text-destructive">Straffeshot om {Math.floor(witnessTimeLeft / 60)}m {witnessTimeLeft % 60}s hvis vitne ikke svarer</p>
          )}
        </div>
      )}

      {/* Disputed state */}
      {isDisputed && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle size={14} />
            <span>Dispute: {event.dispute_reason}</span>
          </div>
          <p className="text-xs text-muted-foreground">Venter på at admin avgjør...</p>
          {isAdmin && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onConfirm("admin_resolve", undefined, "confirm")}
                className="flex-1 py-2.5 rounded-lg bg-success/10 text-success text-sm font-semibold flex items-center justify-center gap-1.5">
                <Shield size={14} /> Godkjenn
              </button>
              <button type="button" onClick={() => onConfirm("admin_resolve", undefined, "punish")}
                className="flex-1 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm font-semibold flex items-center justify-center gap-1.5">
                <Shield size={14} /> Straff
              </button>
            </div>
          )}
        </div>
      )}

      {/* Punishment deadline */}
      {isPunished && punishmentTimeLeft !== null && punishmentTimeLeft > 0 && (
        <div className="text-center py-2 space-y-1">
          <p className="text-sm text-destructive font-semibold">
            ⏰ Straffeshot må tas innen {Math.floor(punishmentTimeLeft / 60)}m {punishmentTimeLeft % 60}s
          </p>
          <p className="text-[10px] text-muted-foreground">Ellers blir du midlertidig utestengt</p>
        </div>
      )}

      {/* Status indicators */}
      {event.self_confirmed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check size={14} className="text-success" />
          <span>{winnerName} har bekreftet</span>
        </div>
      )}
      {event.chosen_witness_id && !event.witness_confirmed_by && event.self_confirmed && !isDisputed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye size={14} /> <span>Vitne: {getDisplayName(event.chosen_witness_id)}</span>
        </div>
      )}
      {event.witness_confirmed_by && !isDisputed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye size={14} className="text-success" />
          <span>Bekreftet av {getDisplayName(event.witness_confirmed_by)}</span>
        </div>
      )}
      {isPunished && !punishmentTimeLeft && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle size={14} /> <span>Straffeshot registrert</span>
        </div>
      )}
    </div>
  );
};
