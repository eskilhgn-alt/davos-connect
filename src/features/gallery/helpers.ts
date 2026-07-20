/**
 * Pure helpers for the Gallery feature. Side-effect free so they can be unit
 * tested cheaply. Business logic lives here; components and hooks are thin
 * shells over these.
 */
import type {
  AnyComment,
  CommentCursor,
  CommentRow,
  CursorKey,
  DeleteMode,
  GalleryRow,
  OptimisticComment,
} from "./types";

// ─── Cursor pagination (feed) ─────────────────────────────────────────────
export function cursorFromLast(rows: readonly GalleryRow[]): CursorKey | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { created_at: last.created_at, id: last.id };
}

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

export function cursorPredicate(cursor: CursorKey): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

export function applyInsert(existing: readonly GalleryRow[], row: GalleryRow): GalleryRow[] {
  if (existing.some((r) => r.id === row.id)) return existing.slice();
  return mergeCursorPage([row], existing);
}
export function applyUpdate(existing: readonly GalleryRow[], row: GalleryRow): GalleryRow[] {
  return existing.map((r) => (r.id === row.id ? row : r));
}
export function applyDelete(existing: readonly GalleryRow[], id: string): GalleryRow[] {
  return existing.filter((r) => r.id !== id);
}

// ─── Likes ────────────────────────────────────────────────────────────────
export type LikeAction = "like" | "unlike";

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

export function shouldApplyLikeResult(currentReq: number, resultReq: number): boolean {
  return currentReq === resultReq;
}

/**
 * Per-item like reconciliation. When a server update for item X arrives, if
 * the server-side membership of `userId` matches the optimistic intent, drop
 * the override for that single item. Overrides for OTHER items are preserved
 * — unrelated realtime traffic must not clear an in-flight tap elsewhere.
 */
export function reconcileLikeOverride(
  overrides: ReadonlyMap<string, { set: ReadonlySet<string>; intent: LikeAction }>,
  server: ReadonlyMap<string, ReadonlySet<string>>,
  itemId: string,
  userId: string,
): Map<string, { set: Set<string>; intent: LikeAction }> {
  const next = new Map<string, { set: Set<string>; intent: LikeAction }>();
  for (const [k, v] of overrides) next.set(k, { set: new Set(v.set), intent: v.intent });
  const ov = next.get(itemId);
  if (!ov) return next;
  const serverSet = server.get(itemId) ?? new Set<string>();
  const serverLiked = serverSet.has(userId);
  const wantLiked = ov.intent === "like";
  if (serverLiked === wantLiked) next.delete(itemId);
  return next;
}

/**
 * Common Postgres unique-violation classifier. Treats:
 *  - PostgREST/pg error code "23505"
 *  - Legacy string match /duplicate/i
 * both as an idempotent success signal for INSERT retries.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  if (typeof e.message === "string" && /duplicate/i.test(e.message)) return true;
  return false;
}

// ─── Comments ─────────────────────────────────────────────────────────────
export function applyOptimisticComment(
  list: readonly AnyComment[],
  draft: OptimisticComment,
): AnyComment[] {
  return [...list, { kind: "optimistic", ...draft }];
}

/**
 * When the realtime INSERT (or reload) delivers a server comment we may have
 * posted optimistically, replace the optimistic entry in place.
 * Match order:
 *   1. Strict: server.client_id === optimistic.clientId (canonical).
 *   2. Legacy heuristic (only when server.client_id is null AND we have an
 *      optimistic without a matching client_id): same user + body + within
 *      30 s of created_at. Kept solely for legacy rows that predate Slice 4B.
 */
export function replaceOptimisticWithServer(
  list: readonly AnyComment[],
  server: CommentRow,
): AnyComment[] {
  // 1) Strict client_id match.
  if (server.client_id) {
    const strictIdx = list.findIndex(
      (c) => c.kind === "optimistic" && c.clientId === server.client_id,
    );
    if (strictIdx !== -1) {
      const next = list.slice();
      next[strictIdx] = { kind: "server", ...server };
      return next;
    }
    // Server row with client_id but no matching optimistic: append (dedupe by id).
    if (list.some((c) => c.kind === "server" && c.id === server.id)) return list.slice();
    return [...list, { kind: "server", ...server }];
  }

  // 2) Legacy fallback — only when server row lacks client_id.
  const idx = list.findIndex((c) => {
    if (c.kind !== "optimistic") return false;
    if (c.user_id !== server.user_id) return false;
    if (c.body !== server.body) return false;
    const dt = Math.abs(new Date(c.created_at).getTime() - new Date(server.created_at).getTime());
    return dt < 30_000;
  });
  if (idx === -1) {
    if (list.some((c) => c.kind === "server" && c.id === server.id)) return list.slice();
    return [...list, { kind: "server", ...server }];
  }
  const next = list.slice();
  next[idx] = { kind: "server", ...server };
  return next;
}

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

// ─── Comment pagination ───────────────────────────────────────────────────
/**
 * Extract the OLDEST server cursor from a chronologically-ordered comment
 * list (ascending in view). "Older" means smaller created_at / id, which is
 * the head when the list is ascending. Optimistic drafts are ignored.
 */
export function oldestCommentCursor(list: readonly AnyComment[]): CommentCursor | null {
  for (const c of list) {
    if (c.kind === "server") return { created_at: c.created_at, id: c.id };
  }
  return null;
}

/**
 * Merge an older page (returned newest-first by the server) with the current
 * ascending view. Dedupe by id, keep ordering strictly ascending on
 * (created_at, id). Optimistic drafts are preserved at the end.
 */
export function mergeOlderCommentPage(
  view: readonly AnyComment[],
  incoming: readonly CommentRow[],
): AnyComment[] {
  const seen = new Set<string>();
  const servers: (CommentRow & { kind: "server" })[] = [];
  const drafts: AnyComment[] = [];
  for (const c of view) {
    if (c.kind === "server") {
      if (!seen.has(c.id)) { seen.add(c.id); servers.push({ kind: "server", ...c } as never); }
    } else {
      drafts.push(c);
    }
  }
  for (const r of incoming) {
    if (!seen.has(r.id)) { seen.add(r.id); servers.push({ kind: "server", ...r } as never); }
  }
  servers.sort((a, b) => {
    if (a.created_at === b.created_at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.created_at < b.created_at ? -1 : 1;
  });
  return [...servers, ...drafts];
}

// ─── Delete decision ──────────────────────────────────────────────────────
export function decideDeleteMode(item: Pick<GalleryRow, "source_message_id" | "source_story_id">): DeleteMode {
  if (item.source_message_id || item.source_story_id) return "derived";
  return "direct";
}

// ─── Video poster fallback ───────────────────────────────────────────────
export function videoPosterFallback(item: Pick<GalleryRow, "type" | "thumbnail_path">): { useFallback: boolean } {
  if (item.type !== "video") return { useFallback: false };
  return { useFallback: !item.thumbnail_path };
}

// ─── Viewer navigation ────────────────────────────────────────────────────
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
export function ownedCleanupPaths(
  attemptPaths: readonly string[],
  protectedPaths: ReadonlySet<string>,
): string[] {
  return Array.from(new Set(attemptPaths.filter((p) => p && !protectedPaths.has(p))));
}
