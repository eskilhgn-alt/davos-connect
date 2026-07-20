/**
 * Pure helpers for the Stories feature. Kept side-effect free so they are
 * cheap to unit-test and safe to import from any layer.
 */

import type { StoryGroup } from "@/hooks/useStories";

export interface StoryLocation {
  groupIndex: number;
  storyIndex: number;
}

/** Find both groupIndex and storyIndex for a target story id. */
export function findStoryLocation(
  groups: readonly StoryGroup[],
  storyId: string | null | undefined,
): StoryLocation | null {
  if (!storyId) return null;
  for (let g = 0; g < groups.length; g++) {
    const s = groups[g].stories.findIndex((story) => story.id === storyId);
    if (s >= 0) return { groupIndex: g, storyIndex: s };
  }
  return null;
}

/**
 * After deleting a story at (groupIndex, storyIndex) from `groups`, what
 * should the viewer do?  Returns the next indices, or `null` when the
 * viewer must close (no stories left, or the deleted item was the last).
 */
export function computeNextAfterDelete(
  groups: readonly StoryGroup[],
  deletedStoryId: string,
  currentGroup: number,
  currentStory: number,
): StoryLocation | null {
  // Build a virtual view of what groups look like after removal.
  const nextGroups = groups
    .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== deletedStoryId) }))
    .filter((g) => g.stories.length > 0);
  if (nextGroups.length === 0) return null;

  // Try to stay in the same group if it still has stories.
  const beforeGroup = groups[currentGroup];
  const survivorGroup = nextGroups.findIndex((g) => g.userId === beforeGroup?.userId);
  if (survivorGroup >= 0) {
    const clampedStory = Math.min(currentStory, nextGroups[survivorGroup].stories.length - 1);
    return { groupIndex: survivorGroup, storyIndex: clampedStory };
  }
  // Otherwise advance to the next surviving group (or clamp to last).
  const advanced = Math.min(currentGroup, nextGroups.length - 1);
  return { groupIndex: advanced, storyIndex: 0 };
}

/** Optimistic like/unlike helper. Returns next state; rollback on error is up to caller. */
export function applyOptimisticLike(
  prev: { liked: boolean; count: number },
  nextLiked: boolean,
): { liked: boolean; count: number } {
  if (prev.liked === nextLiked) return prev;
  const delta = nextLiked ? 1 : -1;
  return { liked: nextLiked, count: Math.max(0, prev.count + delta) };
}

/** Common image/video MIME types accepted for a story upload. */
export const SUPPORTED_STORY_MIME = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const MAX_STORY_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_STORY_VIDEO_SEC = 60;

export interface StoryFileValidation {
  ok: boolean;
  reason?: "unsupported_type" | "too_large" | "empty";
}

/** Validate MIME + size of a candidate story upload before preview. */
export function validateStoryFile(file: { size: number; type: string }): StoryFileValidation {
  if (!file.size) return { ok: false, reason: "empty" };
  if (file.size > MAX_STORY_BYTES) return { ok: false, reason: "too_large" };
  const t = (file.type || "").toLowerCase();
  if (!SUPPORTED_STORY_MIME.has(t)) return { ok: false, reason: "unsupported_type" };
  return { ok: true };
}

/**
 * Pure recipient mapper mirroring the story-push server logic.
 * De-duplicates user_ids of tokens with a non-null player_id, excluding the caller.
 */
export function mapStoryPushRecipients(
  tokens: ReadonlyArray<{ user_id: string; player_id: string | null }>,
  callerId: string,
): string[] {
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!t.player_id) continue;
    if (t.user_id === callerId) continue;
    seen.add(t.user_id);
  }
  return Array.from(seen);
}
