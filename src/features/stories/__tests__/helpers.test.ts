import { describe, it, expect } from "vitest";
import {
  findStoryLocation,
  computeNextAfterDelete,
  applyOptimisticLike,
  validateStoryFile,
  mapStoryPushRecipients,
  MAX_STORY_BYTES,
} from "@/features/stories/helpers";
import type { StoryGroup } from "@/hooks/useStories";

const mkGroup = (userId: string, storyIds: string[]): StoryGroup => ({
  userId,
  displayName: userId,
  hasUnviewed: false,
  stories: storyIds.map((id, i) => ({
    id,
    userId,
    storagePath: `${userId}/${id}.jpg`,
    type: "image",
    durationSec: 5,
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    expiresAt: new Date(1_700_000_099_999_999).toISOString(),
    publicUrl: `https://x/${id}`,
    viewed: false,
  })),
});

const groups: StoryGroup[] = [
  mkGroup("u1", ["a", "b"]),
  mkGroup("u2", ["c"]),
  mkGroup("u3", ["d", "e", "f"]),
];

describe("findStoryLocation", () => {
  it("returns exact group+story index for deep-link", () => {
    expect(findStoryLocation(groups, "e")).toEqual({ groupIndex: 2, storyIndex: 1 });
    expect(findStoryLocation(groups, "a")).toEqual({ groupIndex: 0, storyIndex: 0 });
    expect(findStoryLocation(groups, "c")).toEqual({ groupIndex: 1, storyIndex: 0 });
  });
  it("returns null for missing/expired id", () => {
    expect(findStoryLocation(groups, "missing")).toBeNull();
    expect(findStoryLocation(groups, "")).toBeNull();
    expect(findStoryLocation(groups, null)).toBeNull();
    expect(findStoryLocation([], "anything")).toBeNull();
  });
});

describe("computeNextAfterDelete", () => {
  it("advances within same group when possible", () => {
    // delete u3/d (index 0) → survivor group still u3, clamp to 0 (was 0)
    expect(computeNextAfterDelete(groups, "d", 2, 0))
      .toEqual({ groupIndex: 2, storyIndex: 0 });
  });
  it("clamps story index down when deleting last item of same group", () => {
    // delete u3/f (index 2) → same group survives with 2 items, clamp from 2 to 1
    expect(computeNextAfterDelete(groups, "f", 2, 2))
      .toEqual({ groupIndex: 2, storyIndex: 1 });
  });
  it("moves to next surviving group when current group empties", () => {
    // delete u2/c → u2 disappears; caller was at (1,0). Groups become [u1, u3].
    expect(computeNextAfterDelete(groups, "c", 1, 0))
      .toEqual({ groupIndex: 1, storyIndex: 0 });
  });
  it("returns null when nothing survives", () => {
    const lone = [mkGroup("solo", ["only"])];
    expect(computeNextAfterDelete(lone, "only", 0, 0)).toBeNull();
  });
});

describe("applyOptimisticLike", () => {
  it("increments when going unliked → liked", () => {
    expect(applyOptimisticLike({ liked: false, count: 2 }, true))
      .toEqual({ liked: true, count: 3 });
  });
  it("decrements and clamps at zero", () => {
    expect(applyOptimisticLike({ liked: true, count: 0 }, false))
      .toEqual({ liked: false, count: 0 });
  });
  it("is idempotent when target matches current", () => {
    const prev = { liked: true, count: 5 };
    expect(applyOptimisticLike(prev, true)).toBe(prev);
  });
});

describe("validateStoryFile", () => {
  it("accepts common image/video types under 100MB", () => {
    expect(validateStoryFile({ size: 1024, type: "image/jpeg" }).ok).toBe(true);
    expect(validateStoryFile({ size: 1024, type: "video/mp4" }).ok).toBe(true);
    expect(validateStoryFile({ size: 1024, type: "video/quicktime" }).ok).toBe(true);
  });
  it("rejects unsupported types", () => {
    expect(validateStoryFile({ size: 1024, type: "application/pdf" }))
      .toEqual({ ok: false, reason: "unsupported_type" });
  });
  it("rejects >100MB", () => {
    expect(validateStoryFile({ size: MAX_STORY_BYTES + 1, type: "video/mp4" }))
      .toEqual({ ok: false, reason: "too_large" });
  });
  it("rejects empty", () => {
    expect(validateStoryFile({ size: 0, type: "image/jpeg" }))
      .toEqual({ ok: false, reason: "empty" });
  });
});

describe("mapStoryPushRecipients", () => {
  it("dedupes user_ids, drops caller and player_id=null rows", () => {
    const tokens = [
      { user_id: "caller", player_id: "p0" },
      { user_id: "a", player_id: "p1" },
      { user_id: "a", player_id: "p2" }, // second device
      { user_id: "b", player_id: null }, // no active push
      { user_id: "c", player_id: "p3" },
    ];
    expect(mapStoryPushRecipients(tokens, "caller").sort()).toEqual(["a", "c"]);
  });
  it("returns empty array when only caller has tokens", () => {
    expect(mapStoryPushRecipients([{ user_id: "me", player_id: "p" }], "me")).toEqual([]);
  });
});
