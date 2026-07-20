import { describe, it, expect } from "vitest";
import {
  mergeCursorPage,
  cursorPredicate,
  applyInsert,
  applyUpdate,
  applyDelete,
  applyOptimisticLike,
  shouldApplyLikeResult,
  applyOptimisticComment,
  replaceOptimisticWithServer,
  markCommentFailed,
  markCommentRetrying,
  decideDeleteMode,
  videoPosterFallback,
  nextViewerIndex,
  ownedCleanupPaths,
  cursorFromLast,
} from "../helpers";
import type { GalleryRow, AnyComment } from "../types";

const row = (id: string, created_at: string, extra: Partial<GalleryRow> = {}): GalleryRow => ({
  id,
  storage_path: `p/${id}`,
  storage_bucket: "chat-media",
  thumbnail_path: null,
  caption: null,
  type: "image",
  created_at,
  width: null,
  height: null,
  uploaded_by: "u1",
  source_message_id: null,
  source_story_id: null,
  mime_type: null,
  size_bytes: null,
  ...extra,
});

describe("gallery/helpers — cursor pagination", () => {
  it("mergeCursorPage dedupes by id and keeps desc order", () => {
    const a = [row("a", "2025-01-03T10:00:00Z"), row("b", "2025-01-02T10:00:00Z")];
    const b = [row("b", "2025-01-02T10:00:00Z"), row("c", "2025-01-01T10:00:00Z")];
    const merged = mergeCursorPage(a, b);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("mergeCursorPage tie-breaks equal timestamps by id desc", () => {
    const a = [row("a", "2025-01-01T10:00:00Z")];
    const b = [row("b", "2025-01-01T10:00:00Z")];
    expect(mergeCursorPage(a, b).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("cursorFromLast returns the tail cursor", () => {
    const list = [row("a", "2025-01-03T10:00:00Z"), row("b", "2025-01-02T10:00:00Z")];
    expect(cursorFromLast(list)).toEqual({ created_at: "2025-01-02T10:00:00Z", id: "b" });
    expect(cursorFromLast([])).toBeNull();
  });
  it("cursorPredicate emits the composite predicate", () => {
    const p = cursorPredicate({ created_at: "2025-01-02T10:00:00Z", id: "b" });
    expect(p).toBe("created_at.lt.2025-01-02T10:00:00Z,and(created_at.eq.2025-01-02T10:00:00Z,id.lt.b)");
  });
  it("applyInsert prepends new rows and ignores duplicates", () => {
    const a = [row("a", "2025-01-01T10:00:00Z")];
    expect(applyInsert(a, row("b", "2025-01-02T10:00:00Z")).map((r) => r.id)).toEqual(["b", "a"]);
    expect(applyInsert(a, row("a", "2025-01-01T10:00:00Z"))).toEqual(a);
  });
  it("applyUpdate replaces by id", () => {
    const a = [row("a", "2025-01-01T10:00:00Z", { caption: null })];
    const updated = applyUpdate(a, row("a", "2025-01-01T10:00:00Z", { caption: "hei" }));
    expect(updated[0].caption).toBe("hei");
  });
  it("applyDelete removes by id", () => {
    const a = [row("a", "x"), row("b", "y")];
    expect(applyDelete(a, "a").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("gallery/helpers — likes", () => {
  it("applyOptimisticLike toggles the set", () => {
    const m0 = new Map();
    const m1 = applyOptimisticLike(m0, "i1", "u1", "like");
    expect(m1.get("i1")?.has("u1")).toBe(true);
    const m2 = applyOptimisticLike(m1, "i1", "u1", "unlike");
    expect(m2.get("i1")?.has("u1")).toBe(false);
    // Original is unchanged
    expect(m0.size).toBe(0);
  });
  it("shouldApplyLikeResult only accepts the latest request id", () => {
    expect(shouldApplyLikeResult(2, 2)).toBe(true);
    expect(shouldApplyLikeResult(2, 1)).toBe(false);
  });
});

describe("gallery/helpers — comments", () => {
  const server = { id: "s1", item_id: "i1", user_id: "u1", body: "hei", created_at: "2025-01-01T10:00:00Z" };
  const draft: AnyComment = {
    kind: "optimistic",
    clientId: "c1",
    item_id: "i1",
    user_id: "u1",
    body: "hei",
    created_at: "2025-01-01T10:00:01Z",
    state: "pending",
  };
  it("optimistic append then replace on server confirmation", () => {
    const l1 = applyOptimisticComment([], {
      clientId: "c1", item_id: "i1", user_id: "u1", body: "hei",
      created_at: "2025-01-01T10:00:01Z", state: "pending",
    });
    expect(l1).toHaveLength(1);
    const l2 = replaceOptimisticWithServer(l1, server);
    expect(l2).toHaveLength(1);
    expect(l2[0].kind).toBe("server");
  });
  it("append server row when there is no matching optimistic", () => {
    const l = replaceOptimisticWithServer([], server);
    expect(l).toHaveLength(1);
    expect(l[0].kind).toBe("server");
  });
  it("failed state preserves body and clientId", () => {
    const l = markCommentFailed([draft], "c1", "network");
    expect(l[0]).toMatchObject({ kind: "optimistic", clientId: "c1", body: "hei", state: "failed", error: "network" });
  });
  it("retry resets to pending and clears error", () => {
    const failed = markCommentFailed([draft], "c1", "e");
    const retrying = markCommentRetrying(failed, "c1");
    expect(retrying[0]).toMatchObject({ state: "pending", error: undefined });
  });
});

describe("gallery/helpers — delete decision", () => {
  it("direct when both source fields are null", () => {
    expect(decideDeleteMode({ source_message_id: null, source_story_id: null })).toBe("direct");
  });
  it("derived when either source field is present", () => {
    expect(decideDeleteMode({ source_message_id: "m", source_story_id: null })).toBe("derived");
    expect(decideDeleteMode({ source_message_id: null, source_story_id: "s" })).toBe("derived");
  });
});

describe("gallery/helpers — video poster fallback", () => {
  it("uses fallback for video without thumbnail_path", () => {
    expect(videoPosterFallback({ type: "video", thumbnail_path: null }).useFallback).toBe(true);
  });
  it("no fallback for video with thumbnail_path", () => {
    expect(videoPosterFallback({ type: "video", thumbnail_path: "t" }).useFallback).toBe(false);
  });
  it("no fallback for image", () => {
    expect(videoPosterFallback({ type: "image", thumbnail_path: null }).useFallback).toBe(false);
  });
});

describe("gallery/helpers — viewer navigation", () => {
  const list = [row("a", "3"), row("b", "2"), row("c", "1")];
  it("next moves forward", () => {
    expect(nextViewerIndex(list, "a", 1)?.id).toBe("b");
    expect(nextViewerIndex(list, "b", 1)?.id).toBe("c");
  });
  it("prev moves backward", () => {
    expect(nextViewerIndex(list, "b", -1)?.id).toBe("a");
  });
  it("returns null at boundaries", () => {
    expect(nextViewerIndex(list, "a", -1)).toBeNull();
    expect(nextViewerIndex(list, "c", 1)).toBeNull();
    expect(nextViewerIndex(list, "zzz", 1)).toBeNull();
  });
});

describe("gallery/helpers — upload cleanup ownership", () => {
  it("only owned attempt paths are returned", () => {
    const attempt = ["u/a.jpg", "u/a_thumb.jpg"];
    const historical = new Set(["u/legacy.jpg"]);
    expect(ownedCleanupPaths(attempt, historical)).toEqual(["u/a.jpg", "u/a_thumb.jpg"]);
  });
  it("historical paths are excluded even if a caller passes them", () => {
    const attempt = ["u/new.jpg", "u/legacy.jpg"];
    const historical = new Set(["u/legacy.jpg"]);
    expect(ownedCleanupPaths(attempt, historical)).toEqual(["u/new.jpg"]);
  });
  it("empty/falsy paths are dropped", () => {
    expect(ownedCleanupPaths(["", "u/a.jpg"], new Set())).toEqual(["u/a.jpg"]);
  });
});
