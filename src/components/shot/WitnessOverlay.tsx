/**
 * WitnessOverlay – Full-screen overlay for chosen witness to confirm or deny a shot.
 * Deny now requires a reason and sends dispute to admin instead of auto-punish.
 */

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WitnessEvent {
  id: string;
  selected_user_id: string;
  chosen_witness_id: string;
  self_confirmed: boolean;
  witness_confirmed_by: string | null;
  status: string;
}

const DENY_REASONS = [
  { value: "ikke_tatt", label: "Ikke tatt" },
  { value: "usikker", label: "Usikker" },
  { value: "feil_vitne", label: "Feil vitne" },
  { value: "annet", label: "Annet (skriv inn)" },
];

export const WitnessOverlay: React.FC = () => {
  const { user } = useAuth();
  const [event, setEvent] = React.useState<WitnessEvent | null>(null);
  const [winnerName, setWinnerName] = React.useState("Noen");
  const [submitting, setSubmitting] = React.useState(false);
  const [showDeny, setShowDeny] = React.useState(false);
  const [denyReason, setDenyReason] = React.useState("");
  const [denyDetails, setDenyDetails] = React.useState("");
  const [showReasonDropdown, setShowReasonDropdown] = React.useState(false);

  const checkWitness = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("shot_events")
      .select("id, selected_user_id, chosen_witness_id, self_confirmed, witness_confirmed_by, status")
      .eq("status", "selected")
      .eq("chosen_witness_id", user.id)
      .eq("self_confirmed", true)
      .is("witness_confirmed_by", null)
      .limit(1);

    if (data && data.length > 0) {
      const ev = data[0] as unknown as WitnessEvent;
      setEvent(ev);
      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname, full_name")
        .eq("id", ev.selected_user_id)
        .single();
      if (profile) setWinnerName(profile.nickname || profile.full_name || "Noen");
    } else {
      setEvent(null);
    }
  }, [user]);

  React.useEffect(() => { checkWitness(); }, [checkWitness]);

  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("witness-overlay")
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_events" }, () => checkWitness())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, checkWitness]);

  const handleConfirm = async () => {
    if (!event || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("rpc_confirm_shot", {
        p_event_id: event.id,
        p_mode: "witness",
      } as any);
      if (error) { toast.error(error.message); }
      else {
        toast.success("Bekreftet!");
        setEvent(null);
        // Push
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: "witness_confirmed", heading: "Vitne bekreftet! 👁", message: `Vitne bekreftet at ${winnerName} tok shotten.` }),
          }).catch(() => {});
        }
      }
    } catch { toast.error("Noe gikk galt"); }
    finally { setSubmitting(false); }
  };

  const handleDeny = async () => {
    if (!event || submitting || !denyReason) return;
    setSubmitting(true);
    try {
      const reason = denyReason === "annet" ? (denyDetails || "Annet") : DENY_REASONS.find(r => r.value === denyReason)?.label || denyReason;
      const { error } = await supabase.rpc("rpc_confirm_shot", {
        p_event_id: event.id,
        p_mode: "witness_deny",
        p_dispute_reason: reason,
        p_dispute_details: denyDetails || null,
      } as any);
      if (error) { toast.error(error.message); }
      else {
        toast.success("Dispute sendt til admin for vurdering");
        setEvent(null);
        setShowDeny(false);
        // Push to admin
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: "dispute", heading: "Dispute! ⚠️", message: `Vitne avviste ${winnerName}s shot: ${reason}. Admin må avgjøre.` }),
          }).catch(() => {});
        }
      }
    } catch { toast.error("Noe gikk galt"); }
    finally { setSubmitting(false); }
  };

  if (!event) return null;

  const selectedReasonLabel = DENY_REASONS.find(r => r.value === denyReason)?.label || "Velg årsak...";

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <div className="space-y-8 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Eye size={40} className="text-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold text-foreground">Vitnebekreftelse</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <span className="font-semibold text-foreground">{winnerName}</span> sier de har tatt shotten. Stemmer dette?
          </p>
        </div>

        {!showDeny ? (
          <div className="space-y-3">
            <button type="button" onClick={handleConfirm} disabled={submitting}
              className={cn("w-full flex items-center justify-center gap-2 py-5 rounded-xl", "bg-foreground text-background font-heading text-lg font-bold", "transition-all active:scale-[0.97] disabled:opacity-50")}>
              <Check size={22} /> Ja, bekreftet!
            </button>
            <button type="button" onClick={() => setShowDeny(true)} disabled={submitting}
              className={cn("w-full flex items-center justify-center gap-2 py-5 rounded-xl", "border-2 border-destructive text-destructive font-heading text-lg font-bold", "transition-all active:scale-[0.97] disabled:opacity-50")}>
              <X size={22} /> Nei, avslå
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">Hvorfor avslår du?</p>
            
            {/* Reason dropdown */}
            <div className="relative">
              <button type="button" onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                className="w-full flex items-center justify-between py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm">
                <span className={denyReason ? "text-foreground" : "text-muted-foreground"}>{denyReason ? selectedReasonLabel : "Velg årsak..."}</span>
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>
              {showReasonDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
                  {DENY_REASONS.map(r => (
                    <button key={r.value} type="button"
                      onClick={() => { setDenyReason(r.value); setShowReasonDropdown(false); }}
                      className={cn("w-full text-left px-4 py-2.5 text-sm transition-colors", denyReason === r.value ? "bg-foreground/5 font-medium" : "hover:bg-muted/50")}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details input for "annet" */}
            {denyReason === "annet" && (
              <input type="text" placeholder="Beskriv årsaken..."
                value={denyDetails} onChange={e => setDenyDetails(e.target.value)}
                className="w-full py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground" />
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowDeny(false); setDenyReason(""); setDenyDetails(""); }}
                className="flex-1 py-3 rounded-lg border border-border text-sm font-medium">
                Avbryt
              </button>
              <button type="button" onClick={handleDeny} disabled={!denyReason || submitting}
                className={cn("flex-1 py-3 rounded-lg font-semibold text-sm transition-all",
                  denyReason ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                Send dispute
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Dispute sendes til admin for avgjørelse. Ingen automatisk straff.</p>
          </div>
        )}
      </div>
    </div>
  );
};
