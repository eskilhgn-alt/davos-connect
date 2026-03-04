/**
 * ShotScreen – Simplified shot roulette without tokens
 * Anyone can start a round. Random person gets selected after countdown.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { Loader2, Target, Check, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type ShotStatus = "idle" | "countdown" | "selected" | "confirmed" | "punished";

interface ShotEvent {
  id: string;
  status: string;
  countdown_ends_at: string | null;
  selected_user_id: string | null;
  started_by: string | null;
  deadline_at: string | null;
  confirmed_at: string | null;
  self_confirmed: boolean | null;
}

interface ProfileInfo {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export const ShotScreen: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = React.useState<ShotStatus>("idle");
  const [event, setEvent] = React.useState<ShotEvent | null>(null);
  const [countdown, setCountdown] = React.useState(0);
  const [selectedProfile, setSelectedProfile] = React.useState<ProfileInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [acting, setActing] = React.useState(false);

  // Load active event on mount
  const loadActive = React.useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shot_events")
      .select("id, status, countdown_ends_at, selected_user_id, started_by, deadline_at, confirmed_at, self_confirmed")
      .in("status", ["countdown", "selected"])
      .eq("group_id", "global")
      .order("created_at", { ascending: false })
      .limit(1);

    const active = data?.[0] as ShotEvent | undefined;
    if (active) {
      setEvent(active);
      setStatus(active.status as ShotStatus);
      if (active.selected_user_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url")
          .eq("id", active.selected_user_id)
          .single();
        if (p) setSelectedProfile(p);
      }
    } else {
      setEvent(null);
      setStatus("idle");
      setSelectedProfile(null);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { loadActive(); }, [loadActive]);

  // Countdown timer
  React.useEffect(() => {
    if (status !== "countdown" || !event?.countdown_ends_at) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(event.countdown_ends_at!).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        // Finalize
        supabase.rpc("rpc_finalize_countdown", { p_event_id: event.id }).then(({ data, error }) => {
          if (error) {
            errorToast("Kunne ikke trekke bruker");
            loadActive();
          } else {
            loadActive();
          }
        });
      }
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [status, event, loadActive]);

  // Realtime subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("shot-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_events" }, () => {
        loadActive();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadActive]);

  const startRound = async () => {
    setActing(true);
    const { error } = await supabase.rpc("rpc_start_shot_simple", { p_group_id: "global" });
    if (error) {
      errorToast(error.message || "Kunne ikke starte runde");
    } else {
      toast.success("Runde startet! 🎯");
    }
    setActing(false);
    loadActive();
  };

  const confirm = async () => {
    if (!event) return;
    setActing(true);
    const { error } = await supabase.rpc("rpc_confirm_shot", {
      p_event_id: event.id,
      p_mode: "direct",
    });
    if (error) errorToast(error.message);
    else toast.success("Bekreftet! 🍻");
    setActing(false);
    loadActive();
  };

  const refuse = async () => {
    if (!event) return;
    setActing(true);
    const { error } = await supabase.rpc("rpc_confirm_shot", {
      p_event_id: event.id,
      p_mode: "refuse",
    });
    if (error) errorToast(error.message);
    else toast("Nektet 😬");
    setActing(false);
    loadActive();
  };

  const isSelected = event?.selected_user_id === user?.id;
  const selectedName = selectedProfile?.nickname || selectedProfile?.full_name || "Ukjent";

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Shot Roulette" leftAction={<BackButton />} rightAction={
        <button onClick={loadActive} className="tap-target flex items-center justify-center text-muted-foreground">
          <RefreshCw size={18} strokeWidth={1.8} />
        </button>
      } />

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : status === "idle" ? (
          <>
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center">
              <Target size={48} className="text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="font-heading text-xl font-bold text-foreground">Klar for shot?</h2>
              <p className="text-sm text-muted-foreground">Trykk knappen for å trekke en tilfeldig person</p>
            </div>
            <button
              onClick={startRound}
              disabled={acting}
              className={cn(
                "w-full max-w-xs h-14 rounded-2xl font-heading font-bold text-lg",
                "bg-primary text-primary-foreground",
                "active:scale-[0.97] transition-all",
                "disabled:opacity-50"
              )}
            >
              {acting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "🎯 Start runde"}
            </button>
          </>
        ) : status === "countdown" ? (
          <>
            <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <span className="font-heading text-5xl font-black text-primary">{countdown}</span>
            </div>
            <p className="font-heading text-lg font-semibold text-foreground">Trekker snart...</p>
          </>
        ) : status === "selected" ? (
          <>
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {selectedProfile?.avatar_url ? (
                <img src={selectedProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <Target size={48} className="text-primary" />
              )}
            </div>
            <div className="text-center space-y-2">
              <h2 className="font-heading text-xl font-bold text-foreground">{selectedName}</h2>
              <p className="text-sm text-muted-foreground">
                {isSelected ? "Du ble trukket! Ta shot eller nekt." : `${selectedName} ble trukket!`}
              </p>
            </div>
            {isSelected && (
              <div className="flex gap-3 w-full max-w-xs">
                <button
                  onClick={confirm}
                  disabled={acting}
                  className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-heading font-semibold flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50"
                >
                  <Check size={18} /> Ta shot
                </button>
                <button
                  onClick={refuse}
                  disabled={acting}
                  className="flex-1 h-12 rounded-xl border border-border text-foreground font-heading font-semibold flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-50"
                >
                  <X size={18} /> Nekt
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ShotScreen;