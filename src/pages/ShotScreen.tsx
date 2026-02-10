/**
 * ShotScreen – "Shoot your shot" main screen
 * Minimal, full-featured: button, countdown, status, feed, leaderboard
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ShotButton } from "@/components/shot/ShotButton";
import { ShotStatusCard } from "@/components/shot/ShotStatusCard";
import { ShotEventFeed } from "@/components/shot/ShotEventFeed";
import { ShotLeaderboard } from "@/components/shot/ShotLeaderboard";
import { ShotTransparency } from "@/components/shot/ShotTransparency";
import { ShotHistory } from "@/components/shot/ShotHistory";
import { SkiVerticalCard } from "@/components/ski/SkiVerticalCard";
import { SkiAwardClaimDialog } from "@/components/ski/SkiAwardClaimDialog";
import { useSkiTracker } from "@/hooks/useSkiTracker";
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
  punishment_deadline_at: string | null;
  chosen_witness_id: string | null;
  group_id: string;
  dispute_reason: string | null;
  dispute_details: string | null;
  dispute_resolved_by: string | null;
  dispute_resolved_at: string | null;
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
  const { user, isAdmin } = useAuth();
  const [tokens, setTokens] = React.useState<{ balance: number } | null>(null);
  const [activeEvent, setActiveEvent] = React.useState<ShotEvent | null>(null);
  const [logEntries, setLogEntries] = React.useState<ShotLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pressing, setPressing] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Record<string, string>>({});
  const [frikortCount, setFrikortCount] = React.useState(0);
  const countdownTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Activate ski tracker in background
  useSkiTracker();

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
    if (!error && data) setTokens(data as { balance: number });
  }, []);

  // Load active event
  const loadActiveEvent = React.useCallback(async () => {
    const { data } = await supabase
      .from("shot_events")
      .select("*")
      .eq("group_id", GROUP_ID)
      .in("status", ["countdown", "selected", "overdue", "disputed", "confirmed"])
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

  // Load frikort count
  const loadFrikort = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_frikort")
      .select("id")
      .eq("user_id", user.id)
      .is("used_at", null);
    setFrikortCount(data?.length ?? 0);
  }, [user]);

  // Initial load
  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadProfiles(), loadTokens(), loadActiveEvent(), loadLog(), loadFrikort()]);
      setLoading(false);
    };
    load();
  }, [loadProfiles, loadTokens, loadActiveEvent, loadLog, loadFrikort]);

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
        loadFrikort();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "shot_event_log",
      }, () => {
        loadLog();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
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
      const countdownTimer = setTimeout(async () => {
        try {
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
                }),
              }).catch(() => {});
            }
          }
        } catch { /* handled silently */ }
      }, 11000);
      // Store timer ref for cleanup
      countdownTimerRef.current = countdownTimer;
    } catch (e) {
      toast.error("Noe gikk galt");
    } finally {
      setPressing(false);
    }
  }, [user, pressing, profiles]);

  // Confirm shot
  const handleConfirm = React.useCallback(async (mode: string, witnessId?: string, disputeReason?: string, disputeDetails?: string) => {
    if (!activeEvent) return;
    const { error } = await supabase.rpc("rpc_confirm_shot", {
      p_event_id: activeEvent.id,
      p_mode: mode,
      p_witness_id: mode === "self" && witnessId ? witnessId : undefined,
      p_dispute_reason: disputeReason || undefined,
      p_dispute_details: disputeDetails || undefined,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }

    const messages: Record<string, string> = {
      self: "Shot bekreftet! Venter på vitne.",
      witness: "Vitnebekreftelse registrert!",
    };
    toast.success(messages[mode] || "Oppdatert!");

    // Send push for all confirmation events
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      const selectedName = profiles[activeEvent?.selected_user_id || ""] || "Noen";
      const callerName = profiles[user?.id || ""] || "Noen";

      if (mode === "self") {
        // Push to chosen witness specifically
        const witnessId = activeEvent?.chosen_witness_id;
        if (witnessId) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              type: "witness_request",
              heading: "Du er vitne! 👁",
              message: `${callerName} har tatt shotten – bekreft i appen innen 15 min.`,
              include_user_ids: [witnessId],
              url: "https://davos-joy-connect.lovable.app/shot",
            }),
          }).catch(() => {});
        }
        // Also notify everyone else
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "self_confirm",
            heading: "Shot bekreftet! ✅",
            message: `${callerName} har tatt shotten – venter på vitne.`,
            exclude_user_id: user?.id,
          }),
        }).catch(() => {});
      } else if (mode === "witness") {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "witness_confirm",
            heading: "Vitne bekreftet! 👁",
            message: `${callerName} bekreftet som vitne for ${selectedName}.`,
            exclude_user_id: user?.id,
          }),
        }).catch(() => {});
      } else if (mode === "witness_deny") {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "witness_deny",
            heading: "Dispute! ⚠️",
            message: `Vitne avviste ${selectedName}s shot. Admin må avgjøre.`,
          }),
        }).catch(() => {});
      }
    }
  }, [activeEvent, profiles, user]);

  // Use frikort
  const handleUseFrikort = React.useCallback(async () => {
    if (!activeEvent) return;
    const { error } = await supabase.rpc("rpc_use_frikort", { p_event_id: activeEvent.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Frikort brukt! Du slipper denne runden. 🎫");
    loadFrikort();
  }, [activeEvent, loadFrikort]);

  // Allow pressing when no countdown is running — selected/confirmed events don't block new rounds
  const isCountdownActive = activeEvent?.status === "countdown";
  const canPress = !isCountdownActive && tokens && tokens.balance > 0 && !pressing;

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Shoot your shot" leftAction={<BackButton fallbackPath="/hjem" />} />

      <PullToRefreshWrapper
        onRefresh={async () => { await Promise.all([loadTokens(), loadActiveEvent(), loadLog(), loadFrikort()]); }}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="px-6 py-8 space-y-8">
          {/* Token + frikort display */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Tokens</p>
            <p className="font-heading text-2xl font-bold text-foreground mt-1">
              {tokens ? tokens.balance : "..."}
            </p>
            {frikortCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                🎫 {frikortCount} frikort
              </p>
            )}
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
              isAdmin={isAdmin}
              getDisplayName={getDisplayName}
              onConfirm={handleConfirm}
              onUseFrikort={handleUseFrikort}
              hasFrikort={frikortCount > 0}
              profiles={profiles}
            />
          )}

          {/* My shot history */}
          <ShotHistory getDisplayName={getDisplayName} />

          {/* Ski vertical meters */}
          <SkiVerticalCard />

          {/* Leaderboard */}
          <ShotLeaderboard groupId={GROUP_ID} />

          {/* Feed */}
          <ShotEventFeed entries={logEntries} getDisplayName={getDisplayName} />

          {/* Transparency / fairness checker */}
          <ShotTransparency />
        </div>
      </PullToRefreshWrapper>

      {/* Award claim dialog */}
      <SkiAwardClaimDialog />
    </div>
  );
};

export default ShotScreen;
