/**
 * ShotScreen – "Shoot your shot" main screen
 * Minimal, full-featured: button, countdown, status, feed, leaderboard
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ShotButton } from "@/components/shot/ShotButton";
import { ShotStatusCard } from "@/components/shot/ShotStatusCard";
import { ShotEventFeed } from "@/components/shot/ShotEventFeed";
import { ShotLeaderboard } from "@/components/shot/ShotLeaderboard";
import { ShotTokenOverview } from "@/components/shot/ShotTokenOverview";
import { ShotTransparency } from "@/components/shot/ShotTransparency";
import { toast } from "sonner";

const GROUP_ID = "global";

export interface ShotEvent {
  id: string;
  created_at: string;
  started_by: string;
  status: string;
  countdown_ends_at: string | null;
  selected_user_id: string | null;
  selected_at: string | null;
  deadline_at: string | null;
  confirmed_at: string | null;
  self_confirmed: boolean;
  witness_confirmed_by: string | null;
  witness_confirmed_at: string | null;
  punishment_applied_at: string | null;
  chosen_witness_id: string | null;
  group_id: string;
}

export interface ShotLogEntry {
  id: string;
  created_at: string;
  event_id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
}

export const ShotScreen: React.FC = () => {
  const { user } = useAuth();
  const [tokens, setTokens] = React.useState<{ balance: number; max: number } | null>(null);
  const [activeEvent, setActiveEvent] = React.useState<ShotEvent | null>(null);
  const [logEntries, setLogEntries] = React.useState<ShotLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pressing, setPressing] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Record<string, string>>({});

  // Load profiles for display names
  const loadProfiles = React.useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, nickname, full_name, email");
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((p) => {
        map[p.id] = p.nickname || p.full_name || p.email;
      });
      setProfiles(map);
    }
  }, []);

  const getDisplayName = React.useCallback((userId: string | null) => {
    if (!userId) return "Ukjent";
    return profiles[userId] || "Ukjent";
  }, [profiles]);

  // Load tokens
  const loadTokens = React.useCallback(async () => {
    const { data, error } = await supabase.rpc("rpc_get_shot_tokens");
    if (!error && data) setTokens(data as { balance: number; max: number });
  }, []);

  // Load active event
  const loadActiveEvent = React.useCallback(async () => {
    const { data } = await supabase
      .from("shot_events")
      .select("*")
      .eq("group_id", GROUP_ID)
      .in("status", ["countdown", "selected", "overdue"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setActiveEvent(data[0] as unknown as ShotEvent);
      // Check overdue
      const ev = data[0] as unknown as ShotEvent;
      if (ev.status === "selected" && ev.deadline_at && new Date(ev.deadline_at) < new Date() && !ev.confirmed_at) {
        await supabase.rpc("rpc_apply_overdue", { p_event_id: ev.id });
      }
    } else {
      setActiveEvent(null);
    }
  }, []);

  // Load log
  const loadLog = React.useCallback(async () => {
    const { data } = await supabase
      .from("shot_event_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setLogEntries(data as unknown as ShotLogEntry[]);
  }, []);

  // Initial load
  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadProfiles(), loadTokens(), loadActiveEvent(), loadLog()]);
      setLoading(false);
    };
    load();
  }, [loadProfiles, loadTokens, loadActiveEvent, loadLog]);

  // Realtime subscriptions
  React.useEffect(() => {
    const channel = supabase
      .channel("shot-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "shot_events",
      }, () => {
        loadActiveEvent();
        loadTokens();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "shot_event_log",
      }, () => {
        loadLog();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadActiveEvent, loadLog, loadTokens]);

  // Start round
  const handlePress = React.useCallback(async () => {
    if (!user || pressing) return;
    setPressing(true);
    try {
      const { data, error } = await supabase.rpc("rpc_start_shot_round", { p_group_id: GROUP_ID });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Runde startet!");

      // Send push
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        const profile = profiles[user.id] || "Noen";
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: "countdown_started",
            heading: "Shoot your shot! 🎯",
            message: `${profile} trykket knappen! Trekning om 10 sek.`,
            exclude_user_id: user.id,
          }),
        }).catch(() => {});
      }

      // Wait for countdown then finalize
      const eventId = (data as { event_id: string }).event_id;
      setTimeout(async () => {
        const { data: finalData, error: finalError } = await supabase.rpc("rpc_finalize_countdown", { p_event_id: eventId });
        if (!finalError && finalData) {
          const result = finalData as { selected_user_id: string };
          const winnerName = profiles[result.selected_user_id] || "Noen";
          // Push winner
          const sess = await supabase.auth.getSession();
          const t = sess.data.session?.access_token;
          if (t) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
              body: JSON.stringify({
                type: "selected",
                heading: "Vinner trukket! 🏆",
                message: `${winnerName} må ta shot innen 15 minutter!`,
                // Don't exclude anyone - all users should see the winner
              }),
            }).catch(() => {});
          }
        }
      }, 11000);
    } catch (e) {
      toast.error("Noe gikk galt");
    } finally {
      setPressing(false);
    }
  }, [user, pressing, profiles]);

  // Confirm shot
  const handleConfirm = React.useCallback(async (mode: "self" | "witness", witnessId?: string) => {
    if (!activeEvent) return;
    const { error } = await supabase.rpc("rpc_confirm_shot", {
      p_event_id: activeEvent.id,
      p_mode: mode,
      p_witness_id: mode === "self" && witnessId ? witnessId : undefined,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(mode === "self" ? "Shot bekreftet! Venter på vitne." : "Vitnebekreftelse registrert!");
    }
  }, [activeEvent]);

  const canPress = !activeEvent && tokens && tokens.balance > 0 && !pressing;

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Shoot your shot" leftAction={<BackButton fallbackPath="/hjem" />} />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="px-6 py-8 space-y-8">
          {/* Token display */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Tokens</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    tokens && i < tokens.balance ? "bg-foreground" : "bg-border"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tokens ? `${tokens.balance} / ${tokens.max}` : "..."}
            </p>
          </div>

          {/* Big red button */}
          <ShotButton
            onPress={handlePress}
            disabled={!canPress}
            loading={pressing}
            activeEvent={activeEvent}
          />

          {/* Status card */}
          {activeEvent && (
            <ShotStatusCard
              event={activeEvent}
              currentUserId={user?.id || ""}
              getDisplayName={getDisplayName}
              onConfirm={handleConfirm}
              profiles={profiles}
            />
          )}

          {/* Token overview */}
          <ShotTokenOverview />

          {/* Leaderboard */}
          <ShotLeaderboard groupId={GROUP_ID} />

          {/* Feed */}
          <ShotEventFeed entries={logEntries} getDisplayName={getDisplayName} />

          {/* Transparency / fairness checker */}
          <ShotTransparency />
        </div>
      </div>
    </div>
  );
};

export default ShotScreen;
