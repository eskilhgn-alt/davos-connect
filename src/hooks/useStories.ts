/**
 * useStories - Hook for fetching and managing stories.
 * Uses batch-signed URLs against the private `stories` bucket.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { signBatch } from "@/lib/mediaUrl";

export interface Story {
  id: string;
  userId: string;
  storagePath: string;
  type: "video" | "image";
  durationSec: number;
  createdAt: string;
  expiresAt: string;
  /** Signed URL — refreshed automatically by the resolver cache. */
  publicUrl: string;
  viewed: boolean;
  /** True when the batch signer failed to produce a URL for this path. */
  signError?: boolean;
}

export interface StoryGroup {
  userId: string;
  displayName: string;
  stories: Story[];
  hasUnviewed: boolean;
}

export interface DeleteResult {
  ok: boolean;
  /** Set when the DB row was removed but the storage object could not be cleaned up. */
  storageCleanupWarning?: string;
}

export function useStories() {
  const { user } = useAuth();
  const [groups, setGroups] = React.useState<StoryGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  /** Refetch is paused while the viewer is actively open, to avoid resetting playback. */
  const pauseRefetchRef = React.useRef(false);

  const fetchStories = React.useCallback(async () => {
    if (!user) return;
    try {
      const { data: storiesData, error: fetchErr } = await supabase
        .from("stories")
        .select("id, user_id, storage_path, type, duration_sec, created_at, expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      if (fetchErr) throw fetchErr;

      if (!storiesData || storiesData.length === 0) {
        setGroups([]);
        setError(null);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(storiesData.map((s: any) => s.user_id))];
      const storyIds = storiesData.map((s: any) => s.id);
      const paths = [...new Set(storiesData.map((s: any) => s.storage_path))];

      const [profilesRes, viewsRes, signedMap] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, nickname, full_name").in("id", userIds)
          : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
        storyIds.length > 0
          ? supabase.from("story_views").select("story_id").eq("user_id", user.id).in("story_id", storyIds)
          : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
        signBatch("stories", paths),
      ]);

      // Do NOT silently build a feed with missing profile/view data — surface via retry state.
      if ((profilesRes as any).error) throw (profilesRes as any).error;
      if ((viewsRes as any).error) throw (viewsRes as any).error;

      const profileMap = new Map<string, { nickname: string | null; full_name: string | null }>();
      for (const p of (profilesRes.data || []) as any[]) {
        profileMap.set(p.id, { nickname: p.nickname, full_name: p.full_name });
      }
      const viewedIds = new Set((viewsRes.data || []).map((v: any) => v.story_id));


      const groupMap = new Map<string, StoryGroup>();
      for (const row of storiesData as any[]) {
        const signed = signedMap.get(row.storage_path);
        const story: Story = {
          id: row.id,
          userId: row.user_id,
          storagePath: row.storage_path,
          type: row.type,
          durationSec: row.duration_sec || 0,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          publicUrl: signed || "",
          viewed: viewedIds.has(row.id),
          signError: !signed,
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

      const allGroups = Array.from(groupMap.values());
      allGroups.sort((a, b) => {
        if (a.userId === user.id) return -1;
        if (b.userId === user.id) return 1;
        const aTime = new Date(a.stories[a.stories.length - 1].createdAt).getTime();
        const bTime = new Date(b.stories[b.stories.length - 1].createdAt).getTime();
        return bTime - aTime;
      });

      setGroups(allGroups);
      setError(null);
    } catch (err) {
      console.error("[stories] fetch error:", err);
      setError((err as Error)?.message || "Kunne ikke laste historier");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { fetchStories(); }, [fetchStories]);

  React.useEffect(() => {
    const channel = supabase
      .channel("stories-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        if (pauseRefetchRef.current) return; // avoid resetting an open viewer
        fetchStories();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStories]);

  // Ref mirror of `groups` so markViewed can read a deterministic snapshot
  // without relying on in-updater mutation (which is not concurrent-safe).
  const groupsRef = React.useRef<StoryGroup[]>([]);
  React.useEffect(() => { groupsRef.current = groups; }, [groups]);

  /**
   * Mark a story as viewed. Optimistically flips local `viewed`/`hasUnviewed`;
   * rolls back on non-duplicate errors and returns { ok, error } so callers
   * can show a non-disruptive warning.
   */
  const markViewed = React.useCallback(async (
    storyId: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "no_user" };

    // Deterministic pre-state lookup from the ref snapshot.
    let alreadyViewed = false;
    let found = false;
    for (const g of groupsRef.current) {
      const s = g.stories.find((x) => x.id === storyId);
      if (s) { found = true; alreadyViewed = s.viewed; break; }
    }
    if (!found) return { ok: false, error: "not_found" };
    if (alreadyViewed) return { ok: true };

    // Optimistic flip.
    setGroups((prev) => prev.map((g) => {
      const idx = g.stories.findIndex((s) => s.id === storyId);
      if (idx < 0) return g;
      const nextStories = g.stories.slice();
      nextStories[idx] = { ...nextStories[idx], viewed: true };
      return { ...g, stories: nextStories, hasUnviewed: nextStories.some((s) => !s.viewed) };
    }));

    const { error: err } = await supabase
      .from("story_views")
      .insert({ story_id: storyId, user_id: user.id });
    if (err && (err as { code?: string }).code !== "23505") {
      console.warn("[stories] markViewed failed:", err);
      // Rollback only stories we actually flipped.
      setGroups((prev) => prev.map((g) => {
        const idx = g.stories.findIndex((s) => s.id === storyId);
        if (idx < 0) return g;
        const nextStories = g.stories.slice();
        nextStories[idx] = { ...nextStories[idx], viewed: false };
        return { ...g, stories: nextStories, hasUnviewed: true };
      }));
      return { ok: false, error: err.message };
    }
    return { ok: true };
  }, [user]);

  /**
   * Delete own story.
   * Ordering: DB row first (RLS-scoped to owner); storage cleanup after.
   * A storage failure does NOT undo the DB delete — it surfaces a warning.
   */
  const deleteStory = React.useCallback(async (story: Story): Promise<DeleteResult> => {
    if (!user || story.userId !== user.id) throw new Error("Ikke din story");
    const { error: dbErr } = await supabase.from("stories").delete().eq("id", story.id);
    if (dbErr) throw dbErr;
    // Optimistically drop from local groups (also removes the row for the current viewer).
    setGroups((prev) => prev
      .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== story.id) }))
      .filter((g) => g.stories.length > 0),
    );
    const { error: storageErr } = await supabase.storage.from("stories").remove([story.storagePath]);
    if (storageErr) {
      console.warn("[stories] storage cleanup failed:", storageErr);
      return { ok: true, storageCleanupWarning: storageErr.message || "Filen ble ikke fjernet" };
    }
    return { ok: true };
  }, [user]);

  const setRefetchPaused = React.useCallback((paused: boolean) => {
    pauseRefetchRef.current = paused;
  }, []);

  return {
    groups,
    loading,
    error,
    refetch: fetchStories,
    markViewed,
    deleteStory,
    setRefetchPaused,
  };
}
