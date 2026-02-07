/**
 * ShotBanOverlay – Full-screen overlay blocking the app when user has unresolved punishment.
 * Only way to dismiss: start a new shot round via the embedded button.
 */

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const GROUP_ID = "global";

export const ShotBanOverlay: React.FC = () => {
  const { user } = useAuth();
  const [banned, setBanned] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [checked, setChecked] = React.useState(false);

  const checkBan = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("rpc_check_shot_ban");
    if (data && (data as any).banned) {
      setBanned(true);
    } else {
      setBanned(false);
    }
    setChecked(true);
  }, [user]);

  React.useEffect(() => {
    checkBan();
  }, [checkBan]);

  // Listen for shot_events changes to auto-dismiss
  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("ban-check")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "shot_events",
      }, () => {
        checkBan();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, checkBan]);

  const handleStartRound = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("rpc_start_shot_round", { p_group_id: GROUP_ID });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Runde startet! Du er fri.");
        setBanned(false);
      }
    } catch {
      toast.error("Noe gikk galt");
    } finally {
      setLoading(false);
    }
  };

  if (!checked || !banned) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center px-8 text-center">
      <div className="space-y-6 max-w-sm">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={40} className="text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Du er midlertidig utestengt
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Du tok ikke shotten i tide og fikk 2 straffeshots. For å bruke appen videre må du starte en ny runde.
          </p>
        </div>

        <button
          type="button"
          onClick={handleStartRound}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-destructive text-destructive-foreground font-heading font-bold text-lg transition-all active:scale-[0.97] disabled:opacity-50"
        >
          <Target size={22} />
          {loading ? "Starter..." : "Shoot your shot!"}
        </button>

        <p className="text-xs text-muted-foreground">
          Dette koster 1 token. Etter nedtellingen kan du bruke appen igjen.
        </p>
      </div>
    </div>
  );
};
