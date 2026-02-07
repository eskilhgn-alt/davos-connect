/**
 * useStories - Hook for fetching and managing stories
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Story {
  id: string;
  userId: string;
  storagePath: string;
  type: "video" | "image";
  durationSec: number;
  createdAt: string;
  expiresAt: string;
  publicUrl: string;
  viewed: boolean;
}

export interface StoryGroup {
  userId: string;
  displayName: string;
  stories: Story[];
  hasUnviewed: boolean;
}

export function useStories() {
  const { user } = useAuth();
  const [groups, setGroups] = React.useState<StoryGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchStories = React.useCallback(async () => {
    if (!user) return;

    // Fetch active (non-expired) stories
    const { data: storiesData, error } = await supabase
      .from("stories")
      .select("id, user_id, storage_path, type, duration_sec, created_at, expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Stories fetch error:", error);
      setLoading(false);
      return;
    }

    // Fetch profile names separately
    const userIds = [...new Set((storiesData || []).map((s: any) => s.user_id))];
    const profileMap = new Map<string, { nickname: string | null; full_name: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", userIds);
      for (const p of (profiles || []) as any[]) {
        profileMap.set(p.id, { nickname: p.nickname, full_name: p.full_name });
      }
    }

    if (error) {
      console.error("Stories fetch error:", error);
      setLoading(false);
      return;
    }

    // Fetch views for current user
    const storyIds = (storiesData || []).map((s: any) => s.id);
    let viewedIds = new Set<string>();
    if (storyIds.length > 0) {
      const { data: viewsData } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("user_id", user.id)
        .in("story_id", storyIds);
      viewedIds = new Set((viewsData || []).map((v: any) => v.story_id));
    }

    // Group by user
    const groupMap = new Map<string, StoryGroup>();
    for (const row of (storiesData || []) as any[]) {
      const { data: urlData } = supabase.storage
        .from("stories")
        .getPublicUrl(row.storage_path);

      const story: Story = {
        id: row.id,
        userId: row.user_id,
        storagePath: row.storage_path,
        type: row.type,
        durationSec: row.duration_sec || 0,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        publicUrl: urlData.publicUrl,
        viewed: viewedIds.has(row.id),
      };

      if (!groupMap.has(row.user_id)) {
        const profile = profileMap.get(row.user_id);
        groupMap.set(row.user_id, {
          userId: row.user_id,
          displayName: profile?.nickname || profile?.full_name || "Ukjent",
          stories: [],
          hasUnviewed: false,
        });
      }
      const group = groupMap.get(row.user_id)!;
      group.stories.push(story);
      if (!story.viewed) group.hasUnviewed = true;
    }

    // Put current user first, then sort by most recent
    const allGroups = Array.from(groupMap.values());
    allGroups.sort((a, b) => {
      if (a.userId === user.id) return -1;
      if (b.userId === user.id) return 1;
      const aTime = new Date(a.stories[a.stories.length - 1].createdAt).getTime();
      const bTime = new Date(b.stories[b.stories.length - 1].createdAt).getTime();
      return bTime - aTime;
    });

    setGroups(allGroups);
    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  // Realtime subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("stories-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        fetchStories();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchStories]);

  const markViewed = React.useCallback(async (storyId: string) => {
    if (!user) return;
    await supabase
      .from("story_views")
      .upsert({ story_id: storyId, user_id: user.id }, { onConflict: "story_id,user_id" });
  }, [user]);

  return { groups, loading, refetch: fetchStories, markViewed };
}
