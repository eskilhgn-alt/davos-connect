/**
 * ShotScreen – "Shoot your shot" main screen
 * Simplified: no bans, no witness, direct confirm + monster round
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
import { AdminShotPopup } from "@/components/shot/AdminShotPopup";
import { SkiAwardClaimDialog } from "@/components/ski/SkiAwardClaimDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { markPageSeen } from "@/hooks/useAppBadges";
import { errorToast } from "@/utils/errorToast";
import { BookOpen } from "lucide-react";


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
  random_checker_id: string | null;
  checker_verdict: string | null;
  checker_reason: string | null;
  admin_verdict: string | null;
  admin_reason: string | null;
  monster_round_id: string | null;
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
  React.useEffect(() => { markPageSeen("shot"); }, []);
  const { user, isAdmin } = useAuth();
  const [tokens, setTokens] = React.useState<{ balance: number } | null>(null);
  const [activeEvent, setActiveEvent] = React.useState<ShotEvent | null>(null);
  const [monsterEvents, setMonsterEvents] = React.useState<ShotEvent[]>([]);
  const [logEntries, setLogEntries] = React.useState<ShotLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pressing, setPressing] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Record<string, string>>({});
  const [frikortCount, setFrikortCount] = React.useState(0);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const countdownTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEventRef = React.useRef<ShotEvent | null>(null);

  React.useEffect(() => { activeEventRef.current = activeEvent; }, [activeEvent]);

  const loadProfiles = React.useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, nickname, full_name, email");
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.nickname || p.full_name || p.email; });
      setProfiles(map);
    }
  }, []);

  const getDisplayName = React.useCallback((userId: string | null) => {
    if (!userId) return "Ukjent";
    return profiles[userId] || "Ukjent";
  }, [profiles]);

  const loadTokens = React.useCallback(async () => {
    const { data, error } = await supabase.rpc("rpc_get_shot_tokens");
    if (!error && data) setTokens(data as { balance: number });
  }, []);

  const tryFinalizeCountdown = React.useCallback(async (ev: ShotEvent): Promise<{ selected_user_id: string } | null> => {
    if (ev.status !== "countdown" || !ev.countdown_ends_at) return null;
    if (new Date(ev.countdown_ends_at) > new Date()) return null;
    try {
      const { data: finalData, error: finalError } = await supabase.rpc("rpc_finalize_countdown", { p_event_id: ev.id });
      if (!finalError && finalData) {
        const result = finalData as { selected_user_id: string; deadline_at?: string; status: string };
        if (result.deadline_at && result.status === "selected") {
          const winnerName = profiles[result.selected_user_id] || "Noen";
          const sess = await supabase.auth.getSession();
          const t = sess.data.session?.access_token;
          if (t) {
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
              body: JSON.stringify({ type: "selected", heading: "Vinner trukket! 🏆", message: `${winnerName} må ta shot!` }),
            }).catch(() => {});
          }
        }
        return result;
      }
    } catch { /* another client may have finalized first */ }
    return null;
  }, [profiles]);

  const loadActiveEvent = React.useCallback(async () => {
    // Regular (non-monster) active event
    const { data } = await supabase
      .from("shot_events")
      .select("*")
      .eq("group_id", GROUP_ID)
      .is("monster_round_id", null)
      .in("status", ["countdown", "selected", "overdue"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const ev = data[0] as unknown as ShotEvent;
      setActiveEvent(ev);

      if (ev.status === "countdown" && ev.countdown_ends_at && new Date(ev.countdown_ends_at) <= new Date()) {
        await tryFinalizeCountdown(ev);
        const { data: updated } = await supabase.from("shot_events").select("*").eq("id", ev.id).limit(1);
        if (updated?.[0]) setActiveEvent(updated[0] as unknown as ShotEvent);
        return;
      }

      if (ev.status === "selected" && ev.deadline_at && new Date(ev.deadline_at) < new Date() && !ev.confirmed_at) {
        const { data: overdueResult } = await supabase.rpc("rpc_apply_overdue", { p_event_id: ev.id });
        const result = overdueResult as { status?: string } | null;
        if (result?.status === "punished") {
          const sess = await supabase.auth.getSession();
          const t = sess.data.session?.access_token;
          if (t) {
            const cowardName = profiles[ev.selected_user_id || ""] || "Noen";
            fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
              body: JSON.stringify({ type: "overdue_shame", heading: "Feiging! 🐔", message: `${cowardName} tok ikke shotten i tide!` }),
            }).catch(() => {});
          }
        }
        loadActiveEvent();
      }
    } else {
      setActiveEvent(null);
    }

    // Monster round active events (for current user)
    if (user) {
      const { data: monsterData } = await supabase
        .from("shot_events")
        .select("*")
        .eq("group_id", GROUP_ID)
        .not("monster_round_id", "is", null)
        .in("status", ["selected"])
        .order("created_at", { ascending: false })
        .limit(20);
      setMonsterEvents((monsterData || []) as unknown as ShotEvent[]);
    }
  }, [profiles, tryFinalizeCountdown, user]);

  const loadLog = React.useCallback(async () => {
    const { data } = await supabase.from("shot_event_log").select("*").order("created_at", { ascending: false }).limit(20);
    if (data) setLogEntries(data as unknown as ShotLogEntry[]);
  }, []);

  const loadFrikort = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("user_frikort").select("id").eq("user_id", user.id).is("used_at", null);
    setFrikortCount(data?.length ?? 0);
  }, [user]);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadProfiles(), loadTokens(), loadActiveEvent(), loadLog(), loadFrikort()]);
      setLoading(false);
    };
    load();
  }, [loadProfiles, loadTokens, loadActiveEvent, loadLog, loadFrikort]);

  React.useEffect(() => {
    const refreshAll = () => { loadActiveEvent(); loadTokens(); loadFrikort(); loadLog(); };
    const channel = supabase
      .channel("shot-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_events" }, () => { loadActiveEvent(); loadTokens(); loadFrikort(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "shot_event_log" }, () => { loadLog(); })
      .subscribe();
    const handleVisibility = () => { if (document.visibilityState === "visible") refreshAll(); };
    document.addEventListener("visibilitychange", handleVisibility);
    const poll = setInterval(() => {
      const ev = activeEventRef.current;
      if (ev && (ev.status === "countdown" || ev.status === "selected")) loadActiveEvent();
    }, 5000);
    pollRef.current = poll as unknown as ReturnType<typeof setTimeout>;
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      if (pollRef.current) clearInterval(pollRef.current as unknown as number);
    };
  }, [loadActiveEvent, loadLog, loadTokens, loadFrikort]);

  // Start regular round
  const handlePress = React.useCallback(async () => {
    if (!user || pressing) return;
    setPressing(true);
    try {
      const { data, error } = await supabase.rpc("rpc_start_shot_round", { p_group_id: GROUP_ID });
      if (error) { errorToast("Kunne ikke starte runde", { description: error.message }); return; }
      const result = data as any;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      if (result.is_monster) {
        // Monster round was triggered randomly!
        toast.success(`🔥 MONSTERRUNDE! ${result.total_users} personer trukket!`);
        if (token) {
          const starterName = profiles[user.id] || "Noen";
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              type: "monster_round",
              heading: "🔥 MONSTERRUNDE! 🔥",
              message: `${starterName} trigget en monsterrunde! ALLE er trukket – alle må ta shot!`,
              url: "https://guttahutte.lovable.app/shot",
            }),
          }).catch(() => {});
        }
        loadActiveEvent();
      } else {
        // Normal round
        toast.success("Runde startet!");
        if (token) {
          const profile = profiles[user.id] || "Noen";
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: "countdown_started", heading: "Shoot your shot! 🎯", message: `${profile} trykket knappen! Trekning om 10 sek.` }),
          }).catch(() => {});
        }
        const eventId = result.event_id;
        const countdownEndsAt = result.countdown_ends_at;
        countdownTimerRef.current = setTimeout(async () => {
          await tryFinalizeCountdown({ id: eventId, status: "countdown", countdown_ends_at: countdownEndsAt } as ShotEvent);
          loadActiveEvent();
        }, 11000);
      }
    } catch { errorToast("Noe gikk galt"); }
    finally { setPressing(false); }
  }, [user, pressing, profiles, loadActiveEvent, tryFinalizeCountdown]);



  // Confirm shot (direct mode)
  const handleConfirm = React.useCallback(async (mode: string) => {
    if (!activeEvent && monsterEvents.length === 0) return;
    // Find the event to confirm – either active or the user's monster event
    let eventToConfirm = activeEvent;
    if (!eventToConfirm || eventToConfirm.selected_user_id !== user?.id) {
      eventToConfirm = monsterEvents.find(e => e.selected_user_id === user?.id && e.status === "selected") || null;
    }
    if (!eventToConfirm) return;

    const { data: freshEvents } = await supabase.from("shot_events").select("*").eq("id", eventToConfirm.id).limit(1);
    const freshEvent = freshEvents?.[0] as unknown as ShotEvent | undefined;
    if (!freshEvent || freshEvent.status === "confirmed" || freshEvent.status === "cancelled" || freshEvent.status === "punished") {
      toast.info("Denne runden er allerede avsluttet.");
      loadActiveEvent();
      return;
    }
    const { error } = await supabase.rpc("rpc_confirm_shot", { p_event_id: freshEvent.id, p_mode: mode } as any);
    if (error) { errorToast("Bekreftelse feilet", { description: error.message }); return; }
    toast.success("Shot bekreftet! ✅");

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      const callerName = profiles[user?.id || ""] || "Noen";
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "direct_confirm",
          heading: "Shot tatt! ✅",
          message: `${callerName} har tatt shotten!`,
          exclude_user_id: user?.id,
        }),
      }).catch(() => {});
    }
    loadActiveEvent();
    loadTokens();
  }, [activeEvent, monsterEvents, profiles, user, loadActiveEvent, loadTokens]);

  // Use frikort
  const handleUseFrikort = React.useCallback(async () => {
    if (!activeEvent) return;
    const { error } = await supabase.rpc("rpc_use_frikort", { p_event_id: activeEvent.id });
    if (error) { errorToast("Frikort-feil", { description: error.message }); return; }
    toast.success("Frikort brukt! Du slipper denne runden. 🎫");
    loadFrikort();
    loadActiveEvent();
  }, [activeEvent, loadFrikort, loadActiveEvent]);

  const hasCountdown = activeEvent && activeEvent.status === "countdown";
  const canPress = !hasCountdown && tokens && tokens.balance > 0 && !pressing;

  // My monster event (if any active)
  const myMonsterEvent = monsterEvents.find(e => e.selected_user_id === user?.id && e.status === "selected");

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Shoot your shot" leftAction={<BackButton fallbackPath="/hjem" />} rightAction={
        <button onClick={() => setRulesOpen(true)} className="tap-target flex items-center justify-center text-primary" aria-label="Regler">
          <BookOpen size={20} strokeWidth={2} />
        </button>
      } />

      <PullToRefreshWrapper
        onRefresh={async () => { await Promise.all([loadTokens(), loadActiveEvent(), loadLog(), loadFrikort()]); }}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="px-6 py-8 space-y-8">
          {/* Token display */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Tokens</p>
            <p className="font-heading text-2xl font-bold text-foreground mt-1">{tokens ? tokens.balance : "..."}</p>
            {frikortCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">🎫 {frikortCount} frikort</p>
            )}
          </div>

          {/* Big red button */}
          <ShotButton onPress={handlePress} disabled={!canPress} loading={pressing} activeEvent={activeEvent} tokenBalance={tokens?.balance ?? null} />



          {/* Monster round events for current user */}
          {myMonsterEvent && !activeEvent && (
            <ShotStatusCard
              event={myMonsterEvent}
              currentUserId={user?.id || ""}
              isAdmin={isAdmin}
              getDisplayName={getDisplayName}
              onConfirm={handleConfirm}
              profiles={profiles}
            />
          )}

          {/* Regular status card (includes monster if user is selected) */}
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

          <ShotHistory getDisplayName={getDisplayName} />
          <ShotLeaderboard groupId={GROUP_ID} />
          <ShotEventFeed entries={logEntries} getDisplayName={getDisplayName} />
          <ShotTransparency />
        </div>
      </PullToRefreshWrapper>

      {!rulesOpen && (
        <button onClick={() => setRulesOpen(true)}
          className="fixed bottom-[calc(var(--bottom-nav-h-effective)+12px)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-foreground/90 backdrop-blur-sm px-4 py-2 text-xs font-medium text-background shadow-lg active:scale-95 transition-transform">
          <BookOpen size={14} /> Regler
        </button>
      )}

      <ShotRulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />
      <AdminShotPopup />
      <SkiAwardClaimDialog />
    </div>
  );
};

/* ---------- Rules Sheet ---------- */
const SHOT_RULES = [
  { title: "Alle er med", desc: "Alle aktive brukere er automatisk med i trekningen." },
  { title: "1 token per runde", desc: "Koster 1 token å starte. Hoarding er lov." },
  { title: "5 tokens per dag", desc: "Du får 5 nye tokens ved midnatt hver dag." },
  { title: "10 sek nedtelling", desc: "Etter du trykker starter en 10 sekunders nedtelling med push til alle." },
  { title: "100% tilfeldig", desc: "Alle har lik sjanse hver gang – ren random trekning." },
  { title: "Direkte bekreftelse", desc: "Den trukne bekrefter selv at shotten er tatt." },
  { title: "🔥 Monsterrunde", desc: "5% sjanse ved hvert trykk – alle trekkes samtidig i tilfeldig rekkefølge!" },
  { title: "Frikort", desc: "Tjenes gjennom ski-kåringer. Lar deg slippe unna en vanlig trekning uten straff." },
];

const ShotRulesSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <SheetHeader>
        <SheetTitle className="font-heading">Regler – Shoot your shot</SheetTitle>
      </SheetHeader>
      <div className="space-y-2 py-4">
        {SHOT_RULES.map((r, i) => (
          <div key={i} className="p-3 rounded-xl border border-border bg-muted/20">
            <p className="text-sm font-semibold text-foreground">{r.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>
    </SheetContent>
  </Sheet>
);

export default ShotScreen;
