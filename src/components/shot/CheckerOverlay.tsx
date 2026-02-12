/**
 * CheckerOverlay – Full-screen overlay for the randomly assigned checker
 * to approve, deny, or escalate a disputed shot to admin.
 */
import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, Check, X, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { cn } from "@/lib/utils";

interface CheckerEvent {
  id: string;
  selected_user_id: string;
  chosen_witness_id: string;
  random_checker_id: string;
  checker_verdict: string | null;
  dispute_reason: string | null;
  dispute_details: string | null;
  status: string;
}

export const CheckerOverlay: React.FC = () => {
  const { user } = useAuth();
  const [event, setEvent] = React.useState<CheckerEvent | null>(null);
  const [winnerName, setWinnerName] = React.useState("Noen");
  const [witnessName, setWitnessName] = React.useState("Noen");
  const [submitting, setSubmitting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const checkForAssignment = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("shot_events")
      .select("id, selected_user_id, chosen_witness_id, random_checker_id, checker_verdict, dispute_reason, dispute_details, status")
      .eq("status", "disputed")
      .eq("random_checker_id", user.id)
      .is("checker_verdict", null)
      .limit(1);

    if (data && data.length > 0) {
      const ev = data[0] as unknown as CheckerEvent;
      setEvent(ev);
      // Load names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", [ev.selected_user_id, ev.chosen_witness_id]);
      if (profiles) {
        profiles.forEach(p => {
          const name = p.nickname || p.full_name || "Ukjent";
          if (p.id === ev.selected_user_id) setWinnerName(name);
          if (p.id === ev.chosen_witness_id) setWitnessName(name);
        });
      }
    } else {
      setEvent(null);
    }
  }, [user]);

  React.useEffect(() => { checkForAssignment(); }, [checkForAssignment]);

  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("checker-overlay")
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_events" }, () => checkForAssignment())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, checkForAssignment]);

  const submitVerdict = async (verdict: "approve" | "deny" | "escalate") => {
    if (!event || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("rpc_checker_verdict", {
        p_event_id: event.id,
        p_verdict: verdict,
        p_reason: reason || null,
      } as any);
      if (error) { errorToast("Feil", { description: error.message }); return; }

      const msgs = { approve: "Godkjent! Shotten teller.", deny: "Avvist! Straff opprettholdt.", escalate: "Eskalert til admin for avgjørelse." };
      toast.success(msgs[verdict]);

      // Send push for escalation
      if (verdict === "escalate") {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              type: "escalate_to_admin",
              heading: "Admin-avgjørelse kreves! 🛡️",
              message: `Tilfeldig sjekker eskalerte dispute for ${winnerName}. Admin må avgjøre.`,
            }),
          }).catch(() => {});
        }
      }

      setEvent(null);
      setReason("");
    } catch { errorToast("Noe gikk galt"); }
    finally { setSubmitting(false); }
  };

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center"
      onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="space-y-6 max-w-sm w-full">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Users size={40} className="text-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold text-foreground">Tilfeldig sjekk</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Du er tilfeldig valgt til å avgjøre om <span className="font-semibold text-foreground">{winnerName}</span> sin shot skal telle.
          </p>
          <div className="bg-muted/30 rounded-lg p-3 text-left space-y-1">
            <p className="text-xs text-muted-foreground">Vitne <span className="font-medium text-foreground">{witnessName}</span> avviste:</p>
            <p className="text-sm text-foreground font-medium">"{event.dispute_reason}"</p>
            {event.dispute_details && <p className="text-xs text-muted-foreground">{event.dispute_details}</p>}
          </div>
        </div>

        {/* Optional reason */}
        <input type="text" placeholder="Skriv begrunnelse (valgfritt)..." value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full py-3 px-4 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground" />

        <div className="space-y-3">
          <button type="button" onClick={() => submitVerdict("approve")} disabled={submitting}
            className={cn("w-full flex items-center justify-center gap-2 py-4 rounded-xl",
              "bg-foreground text-background font-heading text-base font-bold transition-all active:scale-[0.97] disabled:opacity-50")}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Godkjenn – shotten teller
          </button>
          <button type="button" onClick={() => submitVerdict("deny")} disabled={submitting}
            className={cn("w-full flex items-center justify-center gap-2 py-4 rounded-xl",
              "border-2 border-destructive text-destructive font-heading text-base font-bold transition-all active:scale-[0.97] disabled:opacity-50")}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
            Avvis – straff opprettholdes
          </button>
          <button type="button" onClick={() => submitVerdict("escalate")} disabled={submitting}
            className={cn("w-full flex items-center justify-center gap-2 py-3 rounded-xl",
              "border border-border text-foreground text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50")}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={16} />}
            Send til admin for avgjørelse
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground">Ditt valg logges. Kun du kan se denne skjermen.</p>
      </div>
    </div>
  );
};
