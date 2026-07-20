/**
 * Chat pure helpers — extracted so they can be unit tested without
 * pulling in the Supabase client or DOM.
 */

import type { Attachment, Message, ReplyPreview } from './types';

// ---------- Cursor: (created_at, id) deterministic pagination ----------
export interface Cursor {
  createdAt: number; // ms since epoch
  id: string;
}

/** True when candidate is strictly older than the cursor by (createdAt,id). */
export function isBeforeCursor(candidate: { createdAt: number; id: string }, cursor: Cursor): boolean {
  if (candidate.createdAt !== cursor.createdAt) return candidate.createdAt < cursor.createdAt;
  return candidate.id < cursor.id;
}

/**
 * Given the currently loaded messages (sorted ascending), return the cursor
 * that a later "load earlier" call should page before. Returns null when
 * there are no messages yet.
 */
export function oldestCursor(msgs: Array<{ createdAt: number; id: string }>): Cursor | null {
  if (msgs.length === 0) return null;
  let best = msgs[0];
  for (const m of msgs) {
    if (m.createdAt < best.createdAt || (m.createdAt === best.createdAt && m.id < best.id)) {
      best = m;
    }
  }
  return { createdAt: best.createdAt, id: best.id };
}

// ---------- Merge / sort ----------

/** Deterministic ascending order: createdAt then id. */
export function compareMessages(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Merge incoming rows into an existing byId map, dedupe by id. Newer rows overwrite older ones. */
export function mergeIntoMap<T extends { id: string }>(map: Map<string, T>, incoming: T[]): Map<string, T> {
  for (const m of incoming) map.set(m.id, m);
  return map;
}

/** Return ascending sorted list, dedup by id (last wins). */
export function sortedDeduped<T extends { createdAt: number; id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const it of items) byId.set(it.id, it);
  return Array.from(byId.values()).sort(compareMessages);
}

// ---------- Reactions ----------

/** Ever-normalized set is passed in; empty means we've never seen a normalized row for this message. */
export function resolveReactions(
  legacy: Record<string, string[]> | undefined,
  normalizedByUser: Map<string, string> | undefined,
  hasEverHadNormalized: boolean,
): Record<string, string[]> | undefined {
  // Rebuild from normalized rows, if any currently exist.
  if (normalizedByUser && normalizedByUser.size > 0) {
    const out: Record<string, string[]> = {};
    for (const [uid, emoji] of normalizedByUser) {
      if (!out[emoji]) out[emoji] = [];
      out[emoji].push(uid);
    }
    return out;
  }
  // Once a normalized row has ever existed for this message we do not fall
  // back to the legacy JSONB again, even after all normalized rows are removed.
  if (hasEverHadNormalized) return undefined;
  // Otherwise the legacy JSONB is the only source of truth.
  return legacy;
}

// ---------- Attachment filtering ----------

export type MediaKind = 'image' | 'video' | 'gif';

export function isMediaAttachment(a: Attachment): boolean {
  return a.kind === 'image' || a.kind === 'video' || a.kind === 'gif';
}

export function isFileAttachment(a: Attachment): boolean {
  return a.kind === 'file';
}

export function mediaAttachments(atts: Attachment[] | undefined): Attachment[] {
  return (atts || []).filter(isMediaAttachment);
}
export function fileAttachments(atts: Attachment[] | undefined): Attachment[] {
  return (atts || []).filter(isFileAttachment);
}

// ---------- Reply mapping ----------

export interface ReplySource {
  id: string;
  text?: string | null;
  senderName?: string | null;
  deletedAt?: string | null | number;
}

/** Build a ReplyPreview from a row (or null if replyToId is not set). */
export function mapReplyPreview(
  replyToId: string | null | undefined,
  source: ReplySource | undefined,
): ReplyPreview | null {
  if (!replyToId) return null;
  if (!source) return { id: replyToId, text: '', senderName: '', deleted: true };
  const deleted = !!source.deletedAt;
  return {
    id: source.id,
    text: deleted ? '' : (source.text || ''),
    senderName: source.senderName || '',
    deleted,
  };
}

// ---------- Idempotent send helpers ----------

/** Postgres duplicate-key error code from PostgREST. */
export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { code?: string; message?: string; details?: string };
  const code = anyErr.code || '';
  const msg = (anyErr.message || '') + ' ' + (anyErr.details || '');
  return code === '23505' || /duplicate key value|already exists/i.test(msg);
}

/**
 * Filter attachments to those that still need to be uploaded on a retry.
 * An attachment is considered already uploaded when it has no local File
 * handle and its objectUrl points at a persistent URL (not a blob:).
 */
export function attachmentsNeedingUpload(atts: Attachment[]): Attachment[] {
  return atts.filter((a) => !!a.file || (a.objectUrl && a.objectUrl.startsWith('blob:')));
}
export function attachmentsAlreadyUploaded(atts: Attachment[]): Attachment[] {
  return atts.filter((a) => !a.file && a.objectUrl && !a.objectUrl.startsWith('blob:'));
}

/**
 * Sanitize a filename extension to a short alphanumeric allowlist so it is
 * always safe to embed in a storage path. Falls back to "bin".
 */
export function sanitizeExtension(filename: string | undefined | null): string {
  if (!filename) return 'bin';
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return 'bin';
  const raw = filename.slice(dot + 1).toLowerCase();
  const clean = raw.replace(/[^a-z0-9]/g, '');
  if (!clean) return 'bin';
  return clean.slice(0, 8);
}

/**
 * Build a PostgREST .or() filter string that expresses:
 *   created_at < cursor.created_at
 *   OR (created_at = cursor.created_at AND id < cursor.id)
 */
export function buildBeforeCursorOrFilter(cursor: Cursor): string {
  const iso = new Date(cursor.createdAt).toISOString();
  // PostgREST .or() takes a comma-separated expression list. The and(...) group
  // is composite. Values do not need URL encoding here — supabase-js encodes them.
  return `created_at.lt.${iso},and(created_at.eq.${iso},id.lt.${cursor.id})`;
}

// ---------- Fake ordering property tests ----------
/** Convenience for tests: check that a list is sorted ascending by (createdAt,id). */
export function isSorted(list: Array<{ createdAt: number; id: string }>): boolean {
  for (let i = 1; i < list.length; i++) {
    if (compareMessages(list[i - 1], list[i]) > 0) return false;
  }
  return true;
}

