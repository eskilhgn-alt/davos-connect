/**
 * useAppBadges – Unified badge counts for chat, stories, polls + PWA app badge
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

export interface AppBadges {
  chat: number;
  stories: number;
  polls: number;
  total: number;
}

export function useAppBadges(): AppBadges {
  const { user } = useAuth();
  const [badges, setBadges] = React.useState<AppBadges>({ chat: 0, stories: 0, polls: 0, total: 0 });

  const refresh = React.useCallback(async () => {
    if (!user) {
      setBadges({ chat: 0, stories: 0, polls: 0, total: 0 });
      updatePwaBadge(0);
      return;
    }

    const [chatCount, storiesCount, pollsCount] = await Promise.all([
      getUnreadChat(user.id),
      getUnseenStories(user.id),
      getUnvotedPolls(user.id),
    ]);

    const total = chatCount + storiesCount + pollsCount;
    setBadges({ chat: chatCount, stories: storiesCount, polls: pollsCount, total });
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return badges;
}

async function getUnreadChat(userId: string): Promise<number> {
  const { data: reads } = await supabase
    .from("chat_reads")
    .select("message_id")
    .eq("user_id", userId);

  const readIds = new Set((reads || []).map((r) => r.message_id));

  const { data: messages } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", DEFAULT_THREAD_ID)
    .is("deleted_at", null)
    .neq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (messages || []).filter((m) => !readIds.has(m.id)).length;
}

async function getUnseenStories(userId: string): Promise<number> {
  const now = new Date().toISOString();

  // Get active stories not by me
  const { data: stories } = await supabase
    .from("stories")
    .select("id")
    .gt("expires_at", now)
    .neq("user_id", userId);

  if (!stories || stories.length === 0) return 0;

  // Get my views
  const { data: views } = await supabase
    .from("story_views")
    .select("story_id")
    .eq("user_id", userId);

  const viewedIds = new Set((views || []).map((v) => v.story_id));
  return stories.filter((s) => !viewedIds.has(s.id)).length;
}

async function getUnvotedPolls(userId: string): Promise<number> {
  // Active polls
  const { data: polls } = await supabase
    .from("polls")
    .select("id")
    .eq("status", "open");

  if (!polls || polls.length === 0) return 0;

  // My votes
  const { data: votes } = await supabase
    .from("poll_votes")
    .select("poll_id")
    .eq("user_id", userId);

  const votedPollIds = new Set((votes || []).map((v) => v.poll_id));
  return polls.filter((p) => !votedPollIds.has(p.id)).length;
}

function updatePwaBadge(count: number) {
  try {
    if ("setAppBadge" in navigator) {
      if (count > 0) {
        (navigator as any).setAppBadge(count);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  } catch {
    // Not supported or permission denied
  }
}
