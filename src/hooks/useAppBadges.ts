/**
 * useAppBadges – Unified badge counts for chat, stories, polls, agenda and rounds.
 * 
 * Philosophy: A badge clears when the user has SEEN the content (visited the page).
 * Deep interaction (voting, replying) is NOT required to clear a badge.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

// LocalStorage keys for "last visited" timestamps
const LS_KEYS = {
  polls: "badge_last_seen_polls",
  runder: "badge_last_seen_runder",
  agenda: "badge_last_seen_agenda",
} as const;

export interface AppBadges {
  chat: number;
  stories: number;
  polls: number;
  agenda: number;
  runder: number;
  total: number;
}

export function useAppBadges(): AppBadges {
  const { user } = useAuth();
  const [badges, setBadges] = React.useState<AppBadges>({ chat: 0, stories: 0, polls: 0, agenda: 0, runder: 0, total: 0 });

  const refresh = React.useCallback(async () => {
    if (!user) {
      setBadges({ chat: 0, stories: 0, polls: 0, agenda: 0, runder: 0, total: 0 });
      updatePwaBadge(0);
      return;
    }

    const [chatCount, storiesCount, pollsCount, agendaCount, runderCount] = await Promise.all([
      getUnreadChat(user.id),
      getUnseenStories(user.id),
      getNewPollsSinceLastSeen(),
      getNewAgendaSinceLastSeen(),
      getNewRoundsSinceLastSeen(),
    ]);

    const total = chatCount + storiesCount + pollsCount + agendaCount + runderCount;
    setBadges({ chat: chatCount, stories: storiesCount, polls: pollsCount, agenda: agendaCount, runder: runderCount, total });
    updatePwaBadge(total);
  }, [user]);

  React.useEffect(() => {
    refresh();

    const channel = supabase
      .channel("app-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${DEFAULT_THREAD_ID}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_events" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, () => refresh())
      .subscribe();

    // Listen for "page visited" events to clear badges instantly
    const handleBadgeClear = () => refresh();
    window.addEventListener("badge:clear", handleBadgeClear);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("badge:clear", handleBadgeClear);
    };
  }, [refresh]);

  return badges;
}

// ============ Mark page as seen (call from page components) ============

export function markPageSeen(page: keyof typeof LS_KEYS) {
  localStorage.setItem(LS_KEYS[page], new Date().toISOString());
  window.dispatchEvent(new CustomEvent("badge:clear"));
}

// ============ Chat: unread messages since last visit ============

async function getUnreadChat(userId: string): Promise<number> {
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
    .is("deleted_at", null)
    .neq("sender_id", userId)
    .gt("created_at", lastReadAt);

  return count ?? 0;
}

// ============ Stories: unseen stories ============

async function getUnseenStories(userId: string): Promise<number> {
  const now = new Date().toISOString();

  const { data: stories } = await supabase
    .from("stories")
    .select("id")
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

async function getNewPollsSinceLastSeen(): Promise<number> {
  const lastSeen = localStorage.getItem(LS_KEYS.polls) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("polls")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("created_at", lastSeen);

  return count ?? 0;
}

// ============ Agenda: new events since last visit ============

async function getNewAgendaSinceLastSeen(): Promise<number> {
  const lastSeen = localStorage.getItem(LS_KEYS.agenda) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("agenda_events")
    .select("id", { count: "exact", head: true })
    .gt("created_at", lastSeen);

  return count ?? 0;
}

// ============ Runder: new rounds since last visit ============

async function getNewRoundsSinceLastSeen(): Promise<number> {
  const lastSeen = localStorage.getItem(LS_KEYS.runder) || "1970-01-01T00:00:00Z";

  const { count } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
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
