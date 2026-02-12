/**
 * AdminShotPopup – Full-screen overlay for admin to resolve an escalated dispute.
 * Options: Godkjenn, Godkjenn under tvil, Underkjenn, with mandatory reason logging.
 */
import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Check, AlertTriangle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { cn } from "@/lib/utils";

interface DisputeEvent {
  id: string;
  selected_user_id: string;
  chosen_witness_id: string;
  random_checker_id: string | null;
  checker_verdict: string | null;
  checker_reason: string | null;
  dispute_reason: string | null;
  dispute_details: string | null;
  status: string;
}

export const AdminShotPopup: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [event, setEvent] = React.useState<DisputeEvent | null>(null);
  const [winnerName, setWinnerName] = React.useState("Noen");
  const [witnessName, setWitnessName] = React.useState("Noen");
  const [checkerName, setCheckerName] = React.useState("Noen");
  const [submitting, setSubmitting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const checkForDispute = React.useCallback(async () => {
    if (!user || !isAdmin) return;
    // Find disputed events where checker escalated (or no checker assigned)
    const { data } = await supabase
      .from("shot_events")
      .select("id, selected_user_id, chosen_witness_id, random_checker_id, checker_verdict, checker_reason, dispute_reason, dispute_details, status, dispute_resolved_by")
      .eq("status", "disputed")
      .is("dispute_resolved_by", null)
      .limit(5);

    if (data && data.length > 0) {
      // Only show if checker has escalated or no checker assigned
      const escalated = (data as any[]).find(e =>
        e.checker_verdict === "escalate" || !e.random_checker_id
      );
      if (escalated) {
        setEvent(escalated as DisputeEvent);
        const ids = [escalated.selected_user_id, escalated.chosen_witness_id, escalated.random_checker_id].filter(Boolean);
        const { data: profiles } = await supabase.from("profiles").select("id, nickname, full_name").in("id", ids);
        if (profiles) {
          profiles.forEach(p => {
            const name = p.nickname || p.full_name || "Ukjent";
            if (p.id === escalated.selected_user_id) setWinnerName(name);
            if (p.id === escalated.chosen_witness_id) setWitnessName(name);
            if (p.id === escalated.random_checker_id) setCheckerName(name);
          });
        }
      } else {
        setEvent(null);
      }
    } else {
      setEvent(null);
    }
  }, [user, isAdmin]);

  React.useEffect(() => { checkForDispute(); }, [checkForDispute]);

  React.useEffect(() => {
    if (!user || !isAdmin) return;
    const channel = supabase
      .channel("admin-shot-popup")
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_events" }, () => checkForDispute())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, checkForDispute]);

  const submitVerdict = async (verdict: "approve" | "deny" | "approve_reluctant") => {
    if (!event || submitting || !reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("rpc_admin_resolve_shot", {
        p_event_id: event.id,
        p_verdict: verdict,
        p_reason: reason,
      } as any);
      if (error) { errorToast("Feil", { description: error.message }); return; }

      const msgs = {
        approve: "Godkjent – straff fjernet.",
        approve_reluctant: "Godkjent under tvil – straff fjernet.",
        deny: "Underkjent – straff opprettholdt.",
      };
      toast.success(msgs[verdict]);

      // Push notification about resolution
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        const heading = verdict === "deny" ? "Admin: Underkjent 🛡️" : "Admin: Godkjent 🛡️";
        const message = verdict === "deny"
          ? `Admin har avgjort: ${winnerName} sin shot ble underkjent. Straff opprettholdt.`
          : `Admin har avgjort: ${winnerName} sin shot ble ${verdict === "approve_reluctant" ? "godkjent under tvil" : "godkjent"}. Ingen straff.`;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type: "admin_resolved", heading, message }),
        }).catch(() => {});
      }

      setEvent(null);
      setReason("");
    } catch { errorToast("Noe gikk galt"); }
    finally { setSubmitting(false); }
  };

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-6 text-center overflow-y-auto"
      onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="space-y-5 max-w-sm w-full py-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield size={32} className="text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-heading text-xl font-bold text-foreground">Admin-avgjørelse</h1>
          <p className="text-muted-foreground text-sm">En eskalert dispute krever din avgjørelse.</p>
        </div>

        {/* Context */}
        <div className="bg-muted/30 rounded-lg p-4 text-left space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Trukket:</span>
            <span className="font-medium text-foreground">{winnerName}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Vitne avviste:</span>
            <span className="font-medium text-foreground">{witnessName}</span>
          </div>
          {event.dispute_reason && (
            <div className="pt-1 border-t border-border">
              <p className="text-xs text-muted-foreground">Vitnets grunn:</p>
              <p className="text-sm text-foreground font-medium">"{event.dispute_reason}"</p>
              {event.dispute_details && <p className="text-xs text-muted-foreground">{event.dispute_details}</p>}
            </div>
          )}
          {event.checker_verdict === "escalate" && (
            <div className="pt-1 border-t border-border">
              <p className="text-xs text-muted-foreground">Tilfeldig sjekker ({checkerName}) eskalerte:</p>
              {event.checker_reason && <p className="text-xs text-foreground">"{event.checker_reason}"</p>}
            </div>
          )}
        </div>

        {/* Reason input (mandatory) */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1 text-left">Din begrunnelse (påkrevd)</label>
          <textarea placeholder="Skriv begrunnelse for avgjørelsen..." value={reason}
            onChange={e => setReason(e.target.value)} rows={3}
            className="w-full py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground resize-none" />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button type="button" onClick={() => submitVerdict("approve")}
            disabled={submitting || !reason.trim()}
            className={cn("w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-heading font-bold transition-all active:scale-[0.97] disabled:opacity-50",
              reason.trim() ? "bg-foreground text-background" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Godkjenn
          </button>
          <button type="button" onClick={() => submitVerdict("approve_reluctant")}
            disabled={submitting || !reason.trim()}
            className={cn("w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-heading font-bold transition-all active:scale-[0.97] disabled:opacity-50",
              reason.trim() ? "border-2 border-warning text-warning" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
            Godkjenn under tvil
          </button>
          <button type="button" onClick={() => submitVerdict("deny")}
            disabled={submitting || !reason.trim()}
            className={cn("w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-heading font-bold transition-all active:scale-[0.97] disabled:opacity-50",
              reason.trim() ? "border-2 border-destructive text-destructive" : "bg-muted text-muted-foreground cursor-not-allowed")}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            Underkjenn – straff opprettholdes
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground">Alle avgjørelser loggføres med begrunnelse i audit-loggen.</p>
      </div>
    </div>
  );
};
