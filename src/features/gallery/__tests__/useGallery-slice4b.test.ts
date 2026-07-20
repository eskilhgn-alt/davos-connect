/**
 * Slice 4B regression tests for helpers.
 * The hooks themselves rely on live Supabase; the pure helpers below exercise
 * the reconciliation and cursor logic that the hooks compose.
 */
import { describe, it, expect } from "vitest";
import {
  reconcileLikeOverride,
  isUniqueViolation,
  replaceOptimisticWithServer,
  mergeOlderCommentPage,
  oldestCommentCursor,
} from "../helpers";
import type { AnyComment, CommentRow } from "../types";

describe("slice4b — reconcileLikeOverride (per-item, independent races)", () => {
  it("clears override for item A only when server state matches intent", () => {
    const ov = new Map<string, { set: Set<string>; intent: "like" | "unlike" }>();
    ov.set("A", { set: new Set(["u1"]), intent: "like" });
    ov.set("B", { set: new Set(["u1"]), intent: "like" });
    const server = new Map<string, Set<string>>([["A", new Set(["u1"])]]); // B not liked yet
    const next = reconcileLikeOverride(ov, server, "A", "u1");
    expect(next.has("A")).toBe(false); // reconciled and dropped
    expect(next.has("B")).toBe(true);  // untouched — separate race
  });

  it("keeps override for item A when server still lags behind intent", () => {
    const ov = new Map<string, { set: Set<string>; intent: "like" | "unlike" }>();
    ov.set("A", { set: new Set(["u1"]), intent: "like" });
    const server = new Map<string, Set<string>>(); // server hasn't caught up
    const next = reconcileLikeOverride(ov, server, "A", "u1");
    expect(next.has("A")).toBe(true);
  });

  it("returns a fresh Map (input not mutated)", () => {
    const ov = new Map<string, { set: Set<string>; intent: "like" | "unlike" }>([
      ["A", { set: new Set(["u1"]), intent: "like" }],
    ]);
    const server = new Map<string, Set<string>>([["A", new Set(["u1"])]]);
    const next = reconcileLikeOverride(ov, server, "A", "u1");
    expect(next).not.toBe(ov);
    expect(ov.has("A")).toBe(true);
  });
});

describe("slice4b — isUniqueViolation classifier", () => {
  it("accepts pg code 23505", () => {
    expect(isUniqueViolation({ code: "23505", message: "whatever" })).toBe(true);
  });
  it("accepts legacy /duplicate/i message", () => {
    expect(isUniqueViolation({ code: "42710", message: "duplicate key value violates" })).toBe(true);
  });
  it("rejects unrelated errors", () => {
    expect(isUniqueViolation({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("nope")).toBe(false);
  });
});

describe("slice4b — replaceOptimisticWithServer (client_id first)", () => {
  const draft: AnyComment = {
    kind: "optimistic", clientId: "cid-1", item_id: "i", user_id: "u",
    body: "hei", created_at: "2025-01-01T10:00:00Z", state: "pending",
  };

  it("strict client_id match wins over time heuristic", () => {
    // Different body + far-apart time — heuristic would fail, client_id must win.
    const server: CommentRow = {
      id: "s1", item_id: "i", user_id: "u", body: "helt annet",
      created_at: "2025-06-01T10:00:00Z", client_id: "cid-1",
    };
    const out = replaceOptimisticWithServer([draft], server);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("server");
    expect((out[0] as { id: string }).id).toBe("s1");
  });

  it("legacy heuristic only fires when server row lacks client_id", () => {
    const server: CommentRow = {
      id: "s2", item_id: "i", user_id: "u", body: "hei",
      created_at: "2025-01-01T10:00:05Z", client_id: null,
    };
    const out = replaceOptimisticWithServer([draft], server);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("server");
  });

  it("server row with client_id but no matching optimistic is appended", () => {
    const server: CommentRow = {
      id: "s3", item_id: "i", user_id: "u2", body: "annen",
      created_at: "2025-01-01T10:00:00Z", client_id: "cid-other",
    };
    const out = replaceOptimisticWithServer([draft], server);
    expect(out).toHaveLength(2);
  });

  it("duplicate server insertions with same id are deduped", () => {
    const server: CommentRow = {
      id: "s1", item_id: "i", user_id: "u", body: "x",
      created_at: "2025-01-01T10:00:00Z", client_id: "cid-x",
    };
    const first = replaceOptimisticWithServer([], server);
    const second = replaceOptimisticWithServer(first, server);
    expect(second).toHaveLength(1);
  });
});

describe("slice4b — comment cursor and merge", () => {
  const s = (id: string, ts: string, extra: Partial<CommentRow> = {}): AnyComment => ({
    kind: "server", id, item_id: "i", user_id: "u", body: id,
    created_at: ts, client_id: null, ...extra,
  });
  const draft: AnyComment = {
    kind: "optimistic", clientId: "d1", item_id: "i", user_id: "u",
    body: "pending", created_at: "2025-01-05T10:00:00Z", state: "pending",
  };

  it("oldestCommentCursor picks the head server row", () => {
    const list = [s("a", "2025-01-01T00:00:00Z"), s("b", "2025-01-02T00:00:00Z")];
    expect(oldestCommentCursor(list)).toEqual({ created_at: "2025-01-01T00:00:00Z", id: "a" });
  });

  it("oldestCommentCursor skips optimistic drafts", () => {
    const list = [draft, s("a", "2025-01-01T00:00:00Z")];
    expect(oldestCommentCursor(list)).toEqual({ created_at: "2025-01-01T00:00:00Z", id: "a" });
  });

  it("mergeOlderCommentPage dedupes and preserves ascending order + drafts", () => {
    const view: AnyComment[] = [
      s("b", "2025-01-02T00:00:00Z"),
      s("c", "2025-01-03T00:00:00Z"),
      draft,
    ];
    const older: CommentRow[] = [
      { id: "a", item_id: "i", user_id: "u", body: "a", created_at: "2025-01-01T00:00:00Z", client_id: null },
      { id: "b", item_id: "i", user_id: "u", body: "b", created_at: "2025-01-02T00:00:00Z", client_id: null },
    ];
    const merged = mergeOlderCommentPage(view, older);
    const ids = merged.map((c) => c.kind === "server" ? c.id : `draft:${c.clientId}`);
    expect(ids).toEqual(["a", "b", "c", "draft:d1"]);
  });

  it("mergeOlderCommentPage ties break by id asc when timestamps equal", () => {
    const view: AnyComment[] = [];
    const older: CommentRow[] = [
      { id: "b", item_id: "i", user_id: "u", body: "b", created_at: "2025-01-01T00:00:00Z", client_id: null },
      { id: "a", item_id: "i", user_id: "u", body: "a", created_at: "2025-01-01T00:00:00Z", client_id: null },
    ];
    const merged = mergeOlderCommentPage(view, older);
    expect(merged.map((c) => c.kind === "server" ? c.id : "?")).toEqual(["a", "b"]);
  });
});
