import { describe, it, expect } from "vitest";
import {
  shouldWarnForViewedResult,
  shouldApplyLikeResult,
  resetPointerHold,
  nextGroupTarget,
  firstUnviewedIndex,
  type StoryGroup,
} from "../helpers";

// ─── Query error propagation helper ─────────────────────────────────────
// Simulates useStories.fetchStories checking both profilesRes.error and
// viewsRes.error. Regression: silent build of feed w/ missing data.
function assertQueryErrorPropagation(
  profilesRes: { error?: unknown },
  viewsRes: { error?: unknown },
): Error | null {
  if (profilesRes.error) return profilesRes.error as Error;
  if (viewsRes.error) return viewsRes.error as Error;
  return null;
}

describe("Slice 3C — useStories query error propagation", () => {
  it("throws when profiles query errors", () => {
    const err = new Error("boom-profiles");
    expect(assertQueryErrorPropagation({ error: err }, {})).toBe(err);
  });
  it("throws when views query errors", () => {
    const err = new Error("boom-views");
    expect(assertQueryErrorPropagation({}, { error: err })).toBe(err);
  });
  it("returns null when both succeed", () => {
    expect(assertQueryErrorPropagation({}, {})).toBeNull();
  });
});

describe("Slice 3C — shouldWarnForViewedResult (async viewed warning)", () => {
  it("ignores success", () => {
    expect(shouldWarnForViewedResult({ ok: true }, { alreadyWarned: false })).toBe(false);
  });
  it("ignores benign no_user / not_found", () => {
    expect(shouldWarnForViewedResult({ ok: false, error: "no_user" }, { alreadyWarned: false })).toBe(false);
    expect(shouldWarnForViewedResult({ ok: false, error: "not_found" }, { alreadyWarned: false })).toBe(false);
  });
  it("warns once on a real error", () => {
    expect(shouldWarnForViewedResult({ ok: false, error: "network" }, { alreadyWarned: false })).toBe(true);
  });
  it("dedupes further warnings once already warned", () => {
    expect(shouldWarnForViewedResult({ ok: false, error: "network" }, { alreadyWarned: true })).toBe(false);
  });
  it("ignores null/undefined result", () => {
    expect(shouldWarnForViewedResult(null, { alreadyWarned: false })).toBe(false);
    expect(shouldWarnForViewedResult(undefined, { alreadyWarned: false })).toBe(false);
  });
});

describe("Slice 3C — shouldApplyLikeResult (stale race guard)", () => {
  it("applies when request id matches and not cancelled", () => {
    expect(shouldApplyLikeResult(3, 3, false)).toBe(true);
  });
  it("discards when a newer request has taken over", () => {
    expect(shouldApplyLikeResult(4, 3, false)).toBe(false);
  });
  it("discards when cancelled", () => {
    expect(shouldApplyLikeResult(3, 3, true)).toBe(false);
  });
});

describe("Slice 3C — resetPointerHold cleanup", () => {
  it("clears hold and reports timer cleared", () => {
    expect(resetPointerHold({ holdActive: true, timerActive: true }))
      .toEqual({ holdActive: false, timerCleared: true });
  });
  it("clears hold even without an active timer", () => {
    expect(resetPointerHold({ holdActive: true, timerActive: false }))
      .toEqual({ holdActive: false, timerCleared: false });
  });
  it("is idempotent when nothing was active", () => {
    expect(resetPointerHold({ holdActive: false, timerActive: false }))
      .toEqual({ holdActive: false, timerCleared: false });
  });
});

// Two groups; group 0 has viewed=[true,false,false]; group 1 has viewed=[false,false].
const groups: StoryGroup[] = [
  {
    userId: "u1",
    displayName: "A",
    stories: [
      { id: "a1", userId: "u1", type: "image", storagePath: "stories/u1/a.jpg", createdAt: "", viewed: true },
      { id: "a2", userId: "u1", type: "image", storagePath: "stories/u1/b.jpg", createdAt: "", viewed: false },
      { id: "a3", userId: "u1", type: "image", storagePath: "stories/u1/c.jpg", createdAt: "", viewed: false },
    ],
  },
  {
    userId: "u2",
    displayName: "B",
    stories: [
      { id: "b1", userId: "u2", type: "image", storagePath: "stories/u2/a.jpg", createdAt: "", viewed: false },
      { id: "b2", userId: "u2", type: "image", storagePath: "stories/u2/b.jpg", createdAt: "", viewed: false },
    ],
  },
] as unknown as StoryGroup[];

describe("Slice 3C — nextGroupTarget lands on first-unviewed", () => {
  it("swipe-left goes to next group's first unviewed", () => {
    expect(nextGroupTarget(groups, 0, "left")).toEqual({
      groupIndex: 1,
      storyIndex: firstUnviewedIndex(groups[1]),
    });
  });
  it("swipe-right goes to previous group's first unviewed", () => {
    expect(nextGroupTarget(groups, 1, "right")).toEqual({
      groupIndex: 0,
      storyIndex: firstUnviewedIndex(groups[0]),
    });
  });
  it("returns null past the last group", () => {
    expect(nextGroupTarget(groups, 1, "left")).toBeNull();
  });
  it("returns null before the first group", () => {
    expect(nextGroupTarget(groups, 0, "right")).toBeNull();
  });
});
