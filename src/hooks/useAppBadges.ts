/**
 * useAppBadges – Unified badge counts for chat, stories, polls, agenda and rounds.
 *
 * Philosophy: A badge clears when the user has SEEN the content (visited the page).
 * Deep interaction (voting, replying) is NOT required to clear a badge.
 *
 * Trip-scoping: all counts and "last seen" localStorage keys are namespaced per
 * selected trip. Concurrent refreshes for different trips are generation-guarded
 * so a stale trip-A response can never overwrite trip-B counts or the PWA badge.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTrip } from "@/contexts/TripContext";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

// LocalStorage key bases (per-trip suffix appended at runtime).
const LS_BASES = {
  polls: "badge_last_seen_polls",
  runder: "badge_last_seen_runder",
  agenda: "badge_last_seen_agenda",
} as const;

function lsKey(page: keyof typeof LS_BASES, tripId: string): string {
  return `${LS_BASES[page]}:${tripId}`;
}

export interface AppBadges {
  chat: number;
  stories: number;
  polls: number;
  agenda: number;
  runder: number;
  total: number;
}

const EMPTY_BADGES: AppBadges = { chat: 0, stories: 0, polls: 0, agenda: 0, runder: 0, total: 0 };
const AppBadgesContext = React.createContext<AppBadges>(EMPTY_BADGES);

export const AppBadgesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { selectedTripId } = useTrip();
  const userId = user?.id;
  const [badges, setBadges] = React.useState<AppBadges>(EMPTY_BADGES);
  // Generation counter — increments on every trip change so in-flight A results
  // can be discarded when B is now selected.
  const generation = React.useRef(0);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = React.useCallback(async () => {
    if (!userId || !selectedTripId) {
      setBadges(EMPTY_BADGES);
      updatePwaBadge(0);
      return;
    }
    const gen = ++generation.current;
    const trip = selectedTripId;
    const [chatCount, storiesCount, pollsCount, agendaCount, runderCount] = await Promise.all([
      getUnreadChat(userId, trip),
      getUnseenStories(userId, trip),
      getNewPollsSinceLastSeen(trip),
      getNewAgendaSinceLastSeen(trip),
      getNewRoundsSinceLastSeen(trip),
    ]);
    // Discard results if trip changed or another refresh started.
    if (gen !== generation.current || trip !== selectedTripId) return;
    const total = chatCount + storiesCount + pollsCount + agendaCount + runderCount;
    setBadges({ chat: chatCount, stories: storiesCount, polls: pollsCount, agenda: agendaCount, runder: runderCount, total });
    updatePwaBadge(total);
  }, [userId, selectedTripId]);

  const scheduleRefresh = React.useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void refresh(), 180);
  }, [refresh]);

  React.useEffect(() => {
    // On trip change, immediately clear stale counts to prevent flashing A's
    // badges while B loads. New refresh runs right after.
    setBadges(EMPTY_BADGES);
    updatePwaBadge(0);
    void refresh();

    const channel = supabase
      .channel("app-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${DEFAULT_THREAD_ID}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_events" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, scheduleRefresh)
      .subscribe();

    const handleBadgeClear = () => scheduleRefresh();
    const handleVisible = () => document.visibilityState === "visible" && scheduleRefresh();
    window.addEventListener("badge:clear", handleBadgeClear);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("badge:clear", handleBadgeClear);
      document.removeEventListener("visibilitychange", handleVisible);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [refresh, scheduleRefresh]);

  return React.createElement(AppBadgesContext.Provider, { value: badges }, children);
};

export function useAppBadges(): AppBadges {
  return React.useContext(AppBadgesContext);
}

// ============ Mark page as seen (call from page components) ============
// Requires tripId so a "seen" marker on trip A cannot silence trip B's badges.
export function markPageSeen(page: keyof typeof LS_BASES, tripId: string | null | undefined) {
  if (!tripId) return;
  try {
    localStorage.setItem(lsKey(page, tripId), new Date().toISOString());
  } catch {
    /* Safari private mode */
  }
  window.dispatchEvent(new CustomEvent("badge:clear"));
}


// ============ Chat: unread messages since last visit ============

async function getUnreadChat(userId: string, tripId: string): Promise<number> {
  // Get the latest chat_reads entry for this user to find "last seen" time
  const { data: reads } = await supabase
    .from("chat_reads")
    .select("read_at")
    .eq("user_id", userId)
    .order("read_at", { ascending: false })
    .limit(1);

  const lastReadAt = reads?.[0]?.read_at || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", DEFAULT_THREAD_ID)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .neq("sender_id", userId)
    .gt("created_at", lastReadAt);

  return count ?? 0;
}

// ============ Stories: unseen stories ============

async function getUnseenStories(userId: string, tripId: string): Promise<number> {
  const now = new Date().toISOString();

  const { data: stories } = await supabase
    .from("stories")
    .select("id")
    .eq("trip_id", tripId)
    .gt("expires_at", now)
    .neq("user_id", userId);

  if (!stories || stories.length === 0) return 0;

  const { data: views } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("user_id", userId);

  const viewedIds = new Set((views || []).map((v) => v.story_id));
  return stories.filter((s) => !viewedIds.has(s.id)).length;
}

// ============ Polls: new polls since last visit to polls page ============

async function getNewPollsSinceLastSeen(tripId: string): Promise<number> {
  const lastSeen = localStorage.getItem(lsKey("polls", tripId)) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("polls")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("status", "active")
    .gt("created_at", lastSeen);

  return count ?? 0;
}

// ============ Agenda: new events since last visit ============

async function getNewAgendaSinceLastSeen(tripId: string): Promise<number> {
  const lastSeen = localStorage.getItem(lsKey("agenda", tripId)) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("agenda_events")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .gt("created_at", lastSeen);

  return count ?? 0;
}

// ============ Runder: new rounds since last visit ============

async function getNewRoundsSinceLastSeen(tripId: string): Promise<number> {
  const lastSeen = localStorage.getItem(lsKey("runder", tripId)) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .gt("created_at", lastSeen);

  return count ?? 0;
}

// ============ PWA badge ============

function updatePwaBadge(count: number) {
  try {
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (value: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (badgeNavigator.setAppBadge && badgeNavigator.clearAppBadge) {
      if (count > 0) {
        void badgeNavigator.setAppBadge(count);
      } else {
        void badgeNavigator.clearAppBadge();
      }
    }
  } catch {
    // Not supported or permission denied
  }
}
