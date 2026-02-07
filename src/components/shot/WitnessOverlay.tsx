/**
 * WitnessOverlay – Full-screen overlay for chosen witness to confirm or deny a shot.
 * Listens to realtime changes and shows when current user is the chosen witness.
 */

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X, Check } from "lucide-react";
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

export const WitnessOverlay: React.FC = () => {
  const { user } = useAuth();
  const [event, setEvent] = React.useState<WitnessEvent | null>(null);
  const [winnerName, setWinnerName] = React.useState("Noen");
  const [submitting, setSubmitting] = React.useState(false);

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
      // Get winner name
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

  React.useEffect(() => {
    checkWitness();
  }, [checkWitness]);

  // Realtime listener
  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("witness-overlay")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "shot_events",
      }, () => {
        checkWitness();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, checkWitness]);

  const handleRespond = async (confirm: boolean) => {
    if (!event || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("rpc_confirm_shot", {
        p_event_id: event.id,
        p_mode: confirm ? "witness" : "witness_deny",
        p_witness_id: undefined,
      } as any);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(confirm ? "Bekreftet!" : "Shot avvist – ekstra straffeshot!");
        setEvent(null);

        // Send push to notify everyone
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const heading = confirm ? "Vitne bekreftet! 👁" : "Shot avvist! 🚫";
          const message = confirm
            ? `Vitne bekreftet at ${winnerName} tok shotten.`
            : `Vitne avviste – ${winnerName} får straffeshot!`;
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: confirm ? "witness_confirmed" : "witness_denied", heading, message }),
          }).catch(() => {});
        }
      }
    } catch {
      toast.error("Noe gikk galt");
    } finally {
      setSubmitting(false);
    }
  };

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center">
      <div className="space-y-8 max-w-sm w-full">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Eye size={40} className="text-foreground" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Vitnebekreftelse
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <span className="font-semibold text-foreground">{winnerName}</span> sier de har tatt shotten. Stemmer dette?
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleRespond(true)}
            disabled={submitting}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-5 rounded-xl",
              "bg-foreground text-background font-heading text-lg font-bold",
              "transition-all active:scale-[0.97] disabled:opacity-50"
            )}
          >
            <Check size={22} />
            Ja, bekreftet!
          </button>

          <button
            type="button"
            onClick={() => handleRespond(false)}
            disabled={submitting}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-5 rounded-xl",
              "border-2 border-destructive text-destructive font-heading text-lg font-bold",
              "transition-all active:scale-[0.97] disabled:opacity-50"
            )}
          >
            <X size={22} />
            Nei, ikke tatt!
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Avviser du, får {winnerName} en ekstra straffeshot.
        </p>
      </div>
    </div>
  );
};
