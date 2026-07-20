/**
 * Pure helpers for the Gallery feature. Side-effect free so they can be unit
 * tested cheaply. Business logic lives here; components and hooks are thin
 * shells over these.
 */
import type {
  AnyComment,
  CommentRow,
  CursorKey,
  DeleteMode,
  GalleryRow,
  OptimisticComment,
} from "./types";

// ─── Cursor pagination ────────────────────────────────────────────────────
/**
 * Extract a stable cursor from the last (oldest) row of a page. Returns null
 * when the page is empty. Order used everywhere: created_at desc, id desc.
 */
export function cursorFromLast(rows: readonly GalleryRow[]): CursorKey | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { created_at: last.created_at, id: last.id };
}

/**
 * Merge an incoming page into an existing feed, dedup by id, keep the ordering
 * strictly `created_at desc, id desc`. Idempotent.
 */
export function mergeCursorPage(
  existing: readonly GalleryRow[],
  incoming: readonly GalleryRow[],
): GalleryRow[] {
  const seen = new Set<string>();
  const out: GalleryRow[] = [];
  for (const r of existing) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  for (const r of incoming) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  out.sort((a, b) => {
    if (a.created_at === b.created_at) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    return a.created_at < b.created_at ? 1 : -1;
  });
  return out;
}

/** PostgREST composite predicate: (created_at < c) OR (created_at = c AND id < id). */
export function cursorPredicate(cursor: CursorKey): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

/** Apply a realtime INSERT: prepend if new, ignore duplicates. */
export function applyInsert(existing: readonly GalleryRow[], row: GalleryRow): GalleryRow[] {
  if (existing.some((r) => r.id === row.id)) return existing.slice();
  return mergeCursorPage([row], existing);
}
/** Apply a realtime UPDATE: replace by id. */
export function applyUpdate(existing: readonly GalleryRow[], row: GalleryRow): GalleryRow[] {
  return existing.map((r) => (r.id === row.id ? row : r));
}
/** Apply a realtime DELETE: remove by id. */
export function applyDelete(existing: readonly GalleryRow[], id: string): GalleryRow[] {
  return existing.filter((r) => r.id !== id);
}

// ─── Likes ────────────────────────────────────────────────────────────────
export type LikeAction = "like" | "unlike";

/** Toggle a user's like set for one item. Returns a new Map. */
export function applyOptimisticLike(
  state: ReadonlyMap<string, ReadonlySet<string>>,
  itemId: string,
  userId: string,
  action: LikeAction,
): Map<string, Set<string>> {
  const next = new Map<string, Set<string>>();
  for (const [k, v] of state) next.set(k, new Set(v));
  const cur = next.get(itemId) ?? new Set<string>();
  if (action === "like") cur.add(userId);
  else cur.delete(userId);
  next.set(itemId, cur);
  return next;
}

/**
 * Only apply the server confirmation when the request id matches what the
 * hook currently believes is the latest attempt. Prevents an old, slow
 * response for the same item from overwriting a newer state.
 */
export function shouldApplyLikeResult(currentReq: number, resultReq: number): boolean {
  return currentReq === resultReq;
}

// ─── Comments ─────────────────────────────────────────────────────────────
export function applyOptimisticComment(
  list: readonly AnyComment[],
  draft: OptimisticComment,
): AnyComment[] {
  return [...list, { kind: "optimistic", ...draft }];
}

/**
 * When the realtime INSERT arrives for a comment we already posted
 * optimistically, replace the optimistic entry in place (matched on
 * clientId if we own it, else on user_id+body+time window).
 */
export function replaceOptimisticWithServer(
  list: readonly AnyComment[],
  server: CommentRow,
): AnyComment[] {
  // Prefer strict match: same user + body + within 30s of created_at.
  const idx = list.findIndex((c) => {
    if (c.kind !== "optimistic") return false;
    if (c.user_id !== server.user_id) return false;
    if (c.body !== server.body) return false;
    const dt = Math.abs(new Date(c.created_at).getTime() - new Date(server.created_at).getTime());
    return dt < 30_000;
  });
  if (idx === -1) {
    // Not our optimistic — append as server row (deduped by id below).
    if (list.some((c) => c.kind === "server" && c.id === server.id)) return list.slice();
    return [...list, { kind: "server", ...server }];
  }
  const next = list.slice();
  next[idx] = { kind: "server", ...server };
  return next;
}

/** Mark an optimistic comment as failed while keeping the draft text. */
export function markCommentFailed(
  list: readonly AnyComment[],
  clientId: string,
  message: string,
): AnyComment[] {
  return list.map((c) =>
    c.kind === "optimistic" && c.clientId === clientId
      ? { ...c, state: "failed" as const, error: message }
      : c,
  );
}
/** Restore an optimistic comment to pending for a retry attempt. */
export function markCommentRetrying(
  list: readonly AnyComment[],
  clientId: string,
): AnyComment[] {
  return list.map((c) =>
    c.kind === "optimistic" && c.clientId === clientId
      ? { ...c, state: "pending" as const, error: undefined }
      : c,
  );
}

// ─── Delete decision ──────────────────────────────────────────────────────
/**
 * A gallery row is "derived" when it was created from a chat attachment or a
 * story. Deleting a derived row must NOT touch the source storage object —
 * only the gallery row is removed. Direct uploads own their objects.
 */
export function decideDeleteMode(item: Pick<GalleryRow, "source_message_id" | "source_story_id">): DeleteMode {
  if (item.source_message_id || item.source_story_id) return "derived";
  return "direct";
}

// ─── Video poster fallback ───────────────────────────────────────────────
/**
 * When a video item has no thumbnail_path OR poster generation failed at
 * upload time, we render a decorative fallback tile with a Play icon instead
 * of a broken <img>.
 */
export function videoPosterFallback(item: Pick<GalleryRow, "type" | "thumbnail_path">): { useFallback: boolean } {
  if (item.type !== "video") return { useFallback: false };
  return { useFallback: !item.thumbnail_path };
}

// ─── Viewer navigation ────────────────────────────────────────────────────
/**
 * Pick the neighbour item in a viewer sequence. `dir` = 1 forward (older),
 * -1 backward (newer). Returns null at the boundary (no wrap).
 */
export function nextViewerIndex(
  list: readonly GalleryRow[],
  currentId: string,
  dir: 1 | -1,
): GalleryRow | null {
  const i = list.findIndex((r) => r.id === currentId);
  if (i === -1) return null;
  const j = i + dir;
  if (j < 0 || j >= list.length) return null;
  return list[j];
}

// ─── Upload path ownership ───────────────────────────────────────────────
/**
 * Given the paths this upload attempt uploaded, and a global set of paths
 * that must never be touched (historical rows), return the safe cleanup set.
 * Guarantees no historical object is removed by mistake.
 */
export function ownedCleanupPaths(
  attemptPaths: readonly string[],
  protectedPaths: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(attemptPaths.filter((p) => p && !protectedPaths.has(p))));
}
