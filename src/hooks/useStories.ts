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

import {
  buildStoryCacheKey,
  storyChannelName,
  storyChannelFilter,
  canWriteStory,
} from "@/features/stories/tripScoping";

const STORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readStoryCache(userId: string, tripId: string): StoryGroup[] | null {
  try {
    const raw = localStorage.getItem(buildStoryCacheKey(userId, tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; groups: StoryGroup[] };
    if (!Array.isArray(parsed.groups) || Date.now() - parsed.savedAt > STORY_CACHE_TTL_MS) return null;
    const now = Date.now();
    return parsed.groups
      .map((group) => ({
        ...group,
        stories: group.stories.filter((story) => new Date(story.expiresAt).getTime() > now).map((story) => ({ ...story, publicUrl: "", signError: false })),
      }))
      .filter((group) => group.stories.length > 0);
  } catch {
    return null;
  }
}

function writeStoryCache(userId: string, tripId: string, groups: StoryGroup[]): void {
  try {
    const serializable = groups.map((group) => ({
      ...group,
      stories: group.stories.map((story) => ({ ...story, publicUrl: "", signError: false })),
    }));
    localStorage.setItem(
      buildStoryCacheKey(userId, tripId),
      JSON.stringify({ savedAt: Date.now(), groups: serializable }),
    );
  } catch {
    // Non-fatal on constrained/private storage.
  }
}

/**
 * Trip-scoped stories. `tripId=null` yields an empty, disabled state
 * (no fetches, no subscriptions, no writes). Switching trip resets state
 * and tears down realtime cleanly to prevent cross-trip flashes.
 */
export function useStories(tripId: string | null, isArchive: boolean = false) {
  const { user } = useAuth();
  const [groups, setGroups] = React.useState<StoryGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  /** Refetch is paused while the viewer is actively open, to avoid resetting playback. */
  const pauseRefetchRef = React.useRef(false);

  /** Monotonic request token — mid-flight results from stale trips are discarded. */
  const requestTokenRef = React.useRef(0);
  /** Last trip we actually fetched for; used to guard cache writes and stale results. */
  const activeTripRef = React.useRef<string | null>(null);
  activeTripRef.current = tripId;

  const fetchStories = React.useCallback(async () => {
    if (!user) return;
    if (!tripId) {
      setGroups([]);
      setError(null);
      setLoading(false);
      return;
    }
    const token = ++requestTokenRef.current;
    const requestTrip = tripId;
    try {
      const { data: storiesData, error: fetchErr } = await supabase
        .from("stories")
        .select("id, user_id, storage_path, type, duration_sec, created_at, expires_at")
        .eq("trip_id", requestTrip)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      // Discard results from an earlier trip if the user switched mid-flight.
      if (token !== requestTokenRef.current || requestTrip !== activeTripRef.current) return;

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

      const signedPromise = signBatch("stories", paths);
      const [profilesRes, viewsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, nickname, full_name").in("id", userIds)
          : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
        storyIds.length > 0
          ? supabase.from("story_views").select("story_id").eq("user_id", user.id).in("story_id", storyIds)
          : Promise.resolve({ data: [], error: null } as { data: any[]; error: null }),
      ]);

      if (token !== requestTokenRef.current || requestTrip !== activeTripRef.current) return;

      if ((profilesRes as any).error) throw (profilesRes as any).error;
      if ((viewsRes as any).error) throw (viewsRes as any).error;

      const profileMap = new Map<string, { nickname: string | null; full_name: string | null }>();
      for (const p of (profilesRes.data || []) as any[]) {
        profileMap.set(p.id, { nickname: p.nickname, full_name: p.full_name });
      }
      const viewedIds = new Set((viewsRes.data || []).map((v: any) => v.story_id));


      const groupMap = new Map<string, StoryGroup>();
      for (const row of storiesData as any[]) {
        const story: Story = {
          id: row.id,
          userId: row.user_id,
          storagePath: row.storage_path,
          type: row.type,
          durationSec: row.duration_sec || 0,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          publicUrl: "",
          viewed: viewedIds.has(row.id),
          signError: false,
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
      writeStoryCache(user.id, requestTrip, allGroups);
      setError(null);
      void signedPromise.then((signedMap) => {
        // Only apply signed URLs when the trip hasn't switched under us.
        if (requestTrip !== activeTripRef.current) return;
        setGroups((current) => current.map((group) => ({
          ...group,
          stories: group.stories.map((story) => ({
            ...story,
            publicUrl: signedMap.get(story.storagePath) || story.publicUrl,
            signError: !signedMap.has(story.storagePath),
          })),
        })));
      });
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      console.error("[stories] fetch error:", err);
      setError((err as Error)?.message || "Kunne ikke laste historier");
    } finally {
      if (token === requestTokenRef.current) setLoading(false);
    }
  }, [user, tripId]);

  React.useEffect(() => {
    if (!user || !tripId) {
      // No trip selected → clear any lingering state so no cross-trip flash.
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const cached = readStoryCache(user.id, tripId);
    if (cached) {
      setGroups(cached);
      setLoading(false);
      void signBatch("stories", cached.flatMap((group) => group.stories.map((story) => story.storagePath)));
    } else {
      // Wipe previous trip's rings immediately to prevent flash.
      setGroups([]);
    }
    void fetchStories();
  }, [fetchStories, user, tripId]);

  React.useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(storyChannelName(tripId))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories", filter: storyChannelFilter(tripId) },
        () => {
          if (pauseRefetchRef.current) return; // avoid resetting an open viewer
          fetchStories();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStories, tripId]);


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
    if (!canWriteStory({ tripId, isArchive })) return { ok: false, error: "archive" };


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
  }, [user, tripId, isArchive]);


  /**
   * Delete own story.
   * Ordering: DB row first (RLS-scoped to owner); storage cleanup after.
   * A storage failure does NOT undo the DB delete — it surfaces a warning.
   */
  const deleteStory = React.useCallback(async (story: Story): Promise<DeleteResult> => {
    if (!user || story.userId !== user.id) throw new Error("Ikke din story");
    if (!canWriteStory({ tripId, isArchive })) throw new Error("Arkivmodus – kan ikke slette");
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
  }, [user, tripId, isArchive]);

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
