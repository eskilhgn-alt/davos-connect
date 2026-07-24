/**
 * Chat Store – incremental realtime, optimistic sends, reactions table, reply, typing broadcast.
 *
 * Backward compatible with existing 21 messages: legacy messages.reactions JSONB is used as
 * fallback ONLY when no message_reactions row has ever existed for that message. Once we
 * observe a normalized reaction for a message, we never revive the legacy fallback for it.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Message, Attachment, TypingState, ReplyPreview } from './types';
import {
  compareMessages,
  isBeforeCursor,
  oldestCursor,
  resolveReactions,
  attachmentsAlreadyUploaded,
  attachmentsNeedingUpload,
  isDuplicateKeyError,
  mapReplyPreview,
  sanitizeExtension,
  buildBeforeCursorOrFilter,
  normalizeAttachment,
  serializeAttachmentForPersist,
  type Cursor,
} from './logic';
import { isKnownBucket, signBatch, type Bucket } from '@/lib/mediaUrl';


const DEFAULT_THREAD_ID = '00000000-0000-0000-0000-000000000001';
const INITIAL_PAGE = 50;
const PAGE_SIZE = 50;
const TYPING_TTL_MS = 3000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Bounded deep-link paging: at most this many extra pages to find the target id.
const MAX_DEEP_LINK_PAGES = 40;
const CHAT_CACHE_KEY_BASE = 'guttahutte:chat-latest:v3';
const CHAT_CACHE_LIMIT = 50;

// ============ Trip scoping ============
// The chat store is a module singleton bound to ONE trip at a time. The
// currently selected trip is set from TripContext via setTrip(). All fetches,
// realtime channels, cache keys and inserts are trip-scoped. Switching trip
// tears down the channel, clears in-memory state and reloads the new trip so
// messages from another trip can never leak into the UI.
let currentTripId: string | null = null;
let currentIsArchive = false;
function cacheKey(tripId: string): string {
  return `${CHAT_CACHE_KEY_BASE}:${tripId}`;
}
function requireTripId(): string {
  if (!currentTripId) throw new Error('Ingen aktiv tur valgt for chat');
  return currentTripId;
}

// ============ Auth ============
async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

// ============ Mapping ============
function dbToMessage(row: Record<string, unknown>): Message {
  const attsRaw = Array.isArray(row.attachments) ? row.attachments : [];
  const attachments: Attachment[] = attsRaw.map((a: Record<string, unknown>) => normalizeAttachment(a));

  // Legacy JSONB reactions — only used until a normalized row appears.
  let legacyReactions: Record<string, string[]> | undefined;
  if (row.reactions && typeof row.reactions === 'object' && Object.keys(row.reactions as object).length > 0) {
    legacyReactions = row.reactions as Record<string, string[]>;
  }

  return {
    id: row.id as string,
    text: (row.text as string) || '',
    createdAt: new Date(row.created_at as string).getTime(),
    senderName: row.sender_name as string,
    senderId: row.sender_id as string,
    attachments,
    editedAt: row.edited_at ? new Date(row.edited_at as string).getTime() : undefined,
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string).getTime() : undefined,
    reactions: legacyReactions,
    deliveryState: 'sent',
  };
}

// ============ State ============
type Sub = (msgs: Message[]) => void;
export type ChannelStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';
type StatusSub = (status: ChannelStatus) => void;

interface StoreState {
  byId: Map<string, Message>;
  optimistic: Map<string, Message>;
  reactionsByMessage: Map<string, Map<string, string>>; // messageId -> (userId -> emoji)
  // Set of message ids for which we've ever seen a normalized reaction (from fetch or realtime).
  everHadNormalized: Set<string>;
  cursor: Cursor | null;
  hasMore: boolean;
  loading: boolean;
  channelStatus: ChannelStatus;
}

const state: StoreState = {
  byId: new Map(),
  optimistic: new Map(),
  reactionsByMessage: new Map(),
  everHadNormalized: new Set(),
  cursor: null,
  hasMore: true,
  loading: false,
  channelStatus: 'idle',
};

const subs = new Set<Sub>();
const statusSubs = new Set<StatusSub>();
let replyTo: ReplyPreview | null = null;
const replySubs = new Set<(r: ReplyPreview | null) => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function hydrateMessageCache(): void {
  if (state.byId.size > 0) return;
  if (!currentTripId) return;
  try {
    const raw = localStorage.getItem(cacheKey(currentTripId));
    if (!raw) return;
    const cached = JSON.parse(raw) as { messages?: Message[] };
    if (!Array.isArray(cached.messages)) return;
    for (const message of cached.messages) {
      if (!message?.id || typeof message.createdAt !== 'number') continue;
      state.byId.set(message.id, { ...message, deliveryState: 'sent' });
    }
    state.cursor = oldestCursor(Array.from(state.byId.values()));
    state.hasMore = true;
  } catch {
    // A broken/blocked local cache must never prevent online chat loading.
  }
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!currentTripId) return;
    try {
      const messages = sortedMessages()
        .filter((message) => message.deliveryState === 'sent')
        .slice(-CHAT_CACHE_LIMIT)
        .map((message) => ({
          ...message,
          attachments: message.attachments.map((attachment) => ({
            ...attachment,
            file: undefined,
            objectUrl: attachment.objectUrl?.startsWith('blob:') ? '' : attachment.objectUrl,
            thumbUrl: attachment.thumbUrl?.startsWith('blob:') ? undefined : attachment.thumbUrl,
          })),
        }));
      localStorage.setItem(cacheKey(currentTripId), JSON.stringify({ savedAt: Date.now(), messages }));
    } catch {
      // Safari private mode can reject writes; in-memory chat continues.
    }
  }, 220);
}

function primeMessageMedia(messages: Message[]): void {
  const paths = new Map<Bucket, string[]>();
  for (const message of messages) {
    for (const attachment of message.attachments) {
      if (!attachment.storageBucket || !attachment.storagePath || !isKnownBucket(attachment.storageBucket)) continue;
      const list = paths.get(attachment.storageBucket) ?? [];
      list.push(attachment.storagePath);
      if (attachment.thumbnailPath) list.push(attachment.thumbnailPath);
      paths.set(attachment.storageBucket, list);
    }
  }
  void Promise.all(Array.from(paths, ([bucket, bucketPaths]) => signBatch(bucket, bucketPaths))).catch(() => undefined);
}

function withResolvedReactions(m: Message): Message {
  const normalized = state.reactionsByMessage.get(m.id);
  const reactions = resolveReactions(m.reactions, normalized, state.everHadNormalized.has(m.id));
  return { ...m, reactions };
}

function sortedMessages(): Message[] {
  const all: Message[] = [];
  for (const m of state.byId.values()) all.push(withResolvedReactions(m));
  for (const m of state.optimistic.values()) all.push(m);
  return all.sort(compareMessages);
}

function notify() {
  const snapshot = sortedMessages();
  subs.forEach((s) => s(snapshot));
  schedulePersist();
}
function notifyStatus(next: ChannelStatus) {
  state.channelStatus = next;
  statusSubs.forEach((s) => s(next));
}

// ============ Reactions ============
async function fetchReactionsFor(messageIds: string[]) {
  if (messageIds.length === 0) return;
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds);
  if (error) {
    console.warn('[chat] fetchReactionsFor failed:', error);
    return;
  }
  // Mark every requested message as normalized-source-resolved, even if zero
  // rows came back. This makes the normalized table durably authoritative and
  // prevents legacy JSONB from reviving on reload once it has been superseded.
  for (const mid of messageIds) state.everHadNormalized.add(mid);
  for (const r of data || []) {
    let map = state.reactionsByMessage.get(r.message_id);
    if (!map) {
      map = new Map();
      state.reactionsByMessage.set(r.message_id, map);
    }
    map.set(r.user_id, r.emoji);
  }
}


// ============ Reply expansion ============
async function fetchReplyPreviews(messages: Message[], rows: Record<string, unknown>[]) {
  const ids = rows
    .map((r) => r.reply_to_id as string | null)
    .filter((v): v is string => !!v);
  if (ids.length === 0) return;
  const { data } = await supabase
    .from('messages')
    .select('id, text, sender_name, deleted_at')
    .in('id', ids);
  const byId = new Map<string, { id: string; text: string; senderName: string; deletedAt: string | null }>();
  for (const r of data || []) {
    byId.set(r.id as string, {
      id: r.id as string,
      text: (r.text as string) || '',
      senderName: (r.sender_name as string) || '',
      deletedAt: (r.deleted_at as string | null) ?? null,
    });
  }
  for (let i = 0; i < messages.length; i++) {
    const rid = rows[i].reply_to_id as string | null;
    if (!rid) continue;
    messages[i].replyTo = mapReplyPreview(rid, byId.get(rid));
  }
}

// ============ Initial load / pagination ============
async function loadPage(beforeCursor?: Cursor): Promise<number> {
  if (!currentTripId) return 0; // Ingen tur valgt → ingen globale spørringer.
  const tripAtStart = currentTripId;
  state.loading = true;
  const limit = beforeCursor ? PAGE_SIZE : INITIAL_PAGE;

  // Deterministic (created_at DESC, id DESC) ordering.
  // Composite cursor is expressed server-side via a PostgREST .or() filter so
  // rows sharing the same created_at cannot cause skips or repeats.
  let q = supabase
    .from('messages')
    .select('*')
    .eq('thread_id', DEFAULT_THREAD_ID)
    .eq('trip_id', tripAtStart)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (beforeCursor) {
    q = q.or(buildBeforeCursorOrFilter(beforeCursor));
  }
  const { data, error } = await q;
  state.loading = false;
  // Ignore results if trip was switched mid-flight.
  if (tripAtStart !== currentTripId) return 0;
  if (error) {
    console.error('[chat] loadPage failed', error);
    return 0;
  }
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const messages = rows.map(dbToMessage);
  // Belt-and-suspenders: enforce strict-before-cursor on the client too, in
  // case some future proxy relaxes the predicate.
  let filtered = messages;
  let filteredRows = rows;
  if (beforeCursor) {
    const keep: Message[] = [];
    const keepRows: Record<string, unknown>[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (isBeforeCursor(messages[i], beforeCursor)) {
        keep.push(messages[i]);
        keepRows.push(rows[i]);
      }
    }
    filtered = keep;
    filteredRows = keepRows;
  } else if (messages.length > 0) {
    // A latest-page refresh is authoritative for the visible window. Drop an
    // old cached/paginated tail before resetting the cursor, otherwise a user
    // who was away for >50 messages could retain an unfillable gap.
    const fetchedIds = new Set(messages.map((message) => message.id));
    const newestFetchedAt = Math.max(...messages.map((message) => message.createdAt));
    for (const [id, existing] of state.byId) {
      if (!fetchedIds.has(id) && existing.createdAt <= newestFetchedAt) state.byId.delete(id);
    }
    state.cursor = null;
  }
  for (const m of filtered) state.byId.set(m.id, m);
  primeMessageMedia(filtered);
  const newCursor = oldestCursor(filtered.length ? filtered : []);
  if (newCursor) {
    if (!state.cursor || isBeforeCursor(newCursor, state.cursor)) {
      state.cursor = newCursor;
    }
  }
  // If the query returned fewer rows than the limit, there is nothing older.
  state.hasMore = messages.length >= limit;
  // Render message bodies immediately. Reply previews and reactions are
  // enrichment and must not delay the first useful chat frame.
  notify();
  await Promise.all([
    fetchReplyPreviews(filtered, filteredRows),
    fetchReactionsFor(filtered.map((m) => m.id)),
  ]);
  notify();
  return filtered.length;
}


export async function loadEarlier(): Promise<{ loaded: number; hasMore: boolean }> {
  if (state.loading || !state.hasMore || state.cursor == null) {
    return { loaded: 0, hasMore: state.hasMore };
  }
  const loaded = await loadPage(state.cursor);
  return { loaded, hasMore: state.hasMore };
}

/**
 * Keep loading older pages until the given messageId is in state, or hasMore
 * becomes false, or the safety cap is reached. Non-throwing.
 */
export async function ensureMessageLoaded(messageId: string): Promise<boolean> {
  if (state.byId.has(messageId)) return true;
  let pages = 0;
  while (!state.byId.has(messageId) && state.hasMore && pages < MAX_DEEP_LINK_PAGES) {
    const { loaded } = await loadEarlier();
    pages++;
    if (loaded === 0) break;
  }
  return state.byId.has(messageId);
}

// ============ Realtime ============
async function applyInsert(row: Record<string, unknown>) {
  const msg = dbToMessage(row);
  state.byId.set(msg.id, msg);
  for (const [cid, opt] of state.optimistic) {
    if (opt.id === msg.id) state.optimistic.delete(cid);
  }
  primeMessageMedia([msg]);
  notify();
  await Promise.all([fetchReplyPreviews([msg], [row]), fetchReactionsFor([msg.id])]);
  notify();
}
function applyUpdate(row: Record<string, unknown>) {
  const msg = dbToMessage(row);
  const existing = state.byId.get(msg.id);
  if (existing?.replyTo) msg.replyTo = existing.replyTo;
  state.byId.set(msg.id, msg);
  // Propagate edits / soft-deletes to any already-loaded replies quoting this
  // source, so their reply preview does not stay stale.
  const newPreview = mapReplyPreview(msg.id, {
    id: msg.id,
    text: msg.text,
    senderName: msg.senderName,
    deletedAt: msg.deletedAt ? new Date(msg.deletedAt).toISOString() : null,
  });
  for (const [otherId, other] of state.byId) {
    if (otherId === msg.id) continue;
    if (other.replyTo && other.replyTo.id === msg.id) {
      state.byId.set(otherId, { ...other, replyTo: newPreview });
    }
  }
  notify();
}

function applyDelete(row: Record<string, unknown>) {
  const id = row.id as string;
  if (!id) return;
  state.byId.delete(id);
  state.reactionsByMessage.delete(id);
  // We keep everHadNormalized set — the message is gone anyway.
  notify();
}

function applyReactionChange(evt: string, row: Record<string, unknown> | null, oldRow: Record<string, unknown> | null) {
  const rec = row || oldRow;
  if (!rec) return;
  const mid = rec.message_id as string;
  if (!mid) return;
  let map = state.reactionsByMessage.get(mid);
  if (!map) { map = new Map(); state.reactionsByMessage.set(mid, map); }
  if (evt === 'DELETE' && oldRow) {
    map.delete(oldRow.user_id as string);
  } else if (row) {
    map.set(row.user_id as string, row.emoji as string);
  }
  // A normalized row was seen for this message; do not revive legacy JSONB fallback again.
  state.everHadNormalized.add(mid);
  notify();
}

// ============ Subscribe ============
let messageChannel: ReturnType<typeof supabase.channel> | null = null;
let latestLoad: Promise<number> | null = null;

function revalidateLatest(): Promise<number> {
  if (!currentTripId) return Promise.resolve(0);
  if (latestLoad) return latestLoad;
  latestLoad = loadPage().finally(() => { latestLoad = null; });
  return latestLoad;
}

const handleChatWake = () => {
  if (subs.size > 0 && document.visibilityState === 'visible') {
    void revalidateLatest().catch((error) => console.warn('[chat] wake refresh failed', error));
  }
};

function teardownMessageChannel(): void {
  if (messageChannel) {
    supabase.removeChannel(messageChannel);
    messageChannel = null;
  }
}

function ensureMessageChannel(): void {
  if (!currentTripId) return;
  if (messageChannel) return;
  const tripId = currentTripId;
  notifyStatus('connecting');
  messageChannel = supabase
    .channel(`chat-messages-rt:${tripId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
      (p) => {
        const row = p.new as Record<string, unknown>;
        if (row.trip_id !== currentTripId) return; // guard vs stale channel
        applyInsert(row).catch(console.error);
      })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
      (p) => {
        const row = p.new as Record<string, unknown>;
        if (row.trip_id !== currentTripId) return;
        applyUpdate(row);
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (p) => {
        const row = p.old as Record<string, unknown>;
        // DELETE payloads may not carry trip_id — only apply if we already track it.
        if (row?.id && state.byId.has(row.id as string)) applyDelete(row);
      })
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions' },
      (p) => {
        const rec = (p.new as Record<string, unknown> | null) || (p.old as Record<string, unknown> | null);
        const mid = rec?.message_id as string | undefined;
        // Only apply reactions for messages we've loaded (i.e. current trip).
        if (!mid || !state.byId.has(mid)) return;
        applyReactionChange(p.eventType, p.new as Record<string, unknown> | null, p.old as Record<string, unknown> | null);
      })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        notifyStatus('connected');
        void revalidateLatest().catch((error) => console.warn('[chat] reconnect refresh failed', error));
      }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') notifyStatus('reconnecting');
      else if (status === 'CLOSED') notifyStatus('offline');
    });
}

/**
 * Bind the chat store to a trip. Idempotent for same tripId. Switching trip
 * tears down realtime, clears in-memory state and reloads the new trip so
 * messages from another trip can never leak into the UI.
 */
export function setTrip(tripId: string | null, isArchive = false): void {
  currentIsArchive = isArchive;
  if (tripId === currentTripId) return;
  // Teardown and clear.
  teardownMessageChannel();
  teardownTypingIfIdle();
  state.byId.clear();
  state.optimistic.clear();
  state.reactionsByMessage.clear();
  state.everHadNormalized.clear();
  state.cursor = null;
  state.hasMore = true;
  state.loading = false;
  replyTo = null;
  replySubs.forEach((s) => s(null));
  currentTripId = tripId;
  notify();
  if (tripId && subs.size > 0) {
    hydrateMessageCache();
    notify();
    ensureMessageChannel();
    void revalidateLatest().catch((e) => console.error('[chat] setTrip revalidate', e));
  } else {
    notifyStatus('idle');
  }
}

export function getCurrentTripId(): string | null { return currentTripId; }
export function isArchiveMode(): boolean { return currentIsArchive; }

export function subscribeToMessages(callback: Sub): () => void {
  subs.add(callback);
  if (currentTripId) {
    hydrateMessageCache();
  }
  callback(sortedMessages());
  if (currentTripId) {
    void revalidateLatest().catch((e) => console.error('[chat] latest load', e));
  }

  if (subs.size === 1) {
    window.addEventListener('pageshow', handleChatWake);
    document.addEventListener('visibilitychange', handleChatWake);
  }
  ensureMessageChannel();

  return () => {
    subs.delete(callback);
    if (subs.size === 0) {
      teardownMessageChannel();
      window.removeEventListener('pageshow', handleChatWake);
      document.removeEventListener('visibilitychange', handleChatWake);
      notifyStatus('idle');
    }
  };
}

export function subscribeToChannelStatus(cb: StatusSub): () => void {
  statusSubs.add(cb);
  cb(state.channelStatus);
  return () => { statusSubs.delete(cb); };
}

// ============ Local user (compat) ============
interface LocalUser { id: string; name: string; }
const USER_KEY = 'chat_user';
export function getUser(): LocalUser {
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  const user: LocalUser = { id: crypto.randomUUID(), name: 'Meg' };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}
export function setUserName(name: string): LocalUser {
  const user = getUser();
  user.name = name.trim() || 'Meg';
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}
export function listMessages(): Message[] { return sortedMessages(); }

// ============ Send / Retry ============
interface PendingSend {
  clientId: string;
  text: string;
  attachments: Attachment[]; // updated in place as uploads complete on retry
  senderId: string;
  senderName: string;
  replyToId: string | null;
}

const pendingByClientId = new Map<string, PendingSend>();

function revokeLocalObjectUrls(attachments: Attachment[]): void {
  for (const attachment of attachments) {
    if (attachment.objectUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.objectUrl);
    if (attachment.thumbUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.thumbUrl);
  }
}

async function uploadOne(att: Attachment, senderId: string): Promise<Attachment> {
  // Already uploaded on a previous attempt — nothing to do. A stable
  // (storageBucket, storagePath) is the source of truth for "uploaded"; a
  // non-blob objectUrl is the legacy/external case.
  if ((att.storageBucket && att.storagePath) || (!att.file && att.objectUrl && !att.objectUrl.startsWith('blob:'))) {
    return { ...att, file: undefined };
  }
  const file = att.file;
  if (!file) {
    // Nothing to upload and no stable path — treat as passthrough (should
    // not happen in practice; guarded so retries don't loop).
    return { ...att, file: undefined };
  }
  const rawExt = sanitizeExtension(file.name);
  const fileId = crypto.randomUUID();
  const bucket = 'chat-media' as const;

  // Re-encode images through canvas to strip EXIF; keep videos/gifs as-is.
  // A re-encode failure MUST surface — silently uploading the original file
  // would ship EXIF (GPS, device, timestamp) to storage.
  let uploadBlob: Blob = file;
  let uploadMime = file.type;
  let ext = rawExt;
  if (att.kind === 'image' && file.type.startsWith('image/') && file.type !== 'image/gif') {
    const { reencodeImage } = await import('@/lib/imageOptimize');
    try {
      uploadBlob = await reencodeImage(file, { maxDim: 2000, quality: 0.9, mimeType: 'image/jpeg' });
      uploadMime = 'image/jpeg';
      ext = 'jpg';
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Bildet kunne ikke prosesseres trygt (EXIF-fjerning feilet): ${detail}`);
    }
  }

  if (uploadBlob.size <= 0 || uploadBlob.size > MAX_UPLOAD_BYTES) {
    throw new Error('Den ferdige filen er for stor (maks 20 MB).');
  }

  const path = `${senderId}/${fileId}.${ext}`;
  let thumbnailPath: string | undefined;

  // Thumbnail for images and videos. Thumbnail failure is non-fatal — the
  // renderer has a fallback. Success uploads to storage BEFORE the main file
  // so we can clean it up if the main upload later fails.
  try {
    const { createThumbnail, createVideoThumbnail } = await import('@/utils/imageThumb');
    let thumbBlob: Blob | null = null;
    if (att.kind === 'image' && file.type.startsWith('image/')) {
      thumbBlob = (await createThumbnail(file)).thumbBlob;
    } else if (att.kind === 'video' && file.type.startsWith('video/')) {
      try { thumbBlob = (await createVideoThumbnail(file)).thumbBlob; } catch { /* codec/CORS — fallback UI covers this */ }
    }
    if (thumbBlob) {
      const candidatePath = `${senderId}/${fileId}_thumb.jpg`;
      const { error: thumbErr } = await supabase.storage.from(bucket).upload(candidatePath, thumbBlob, { contentType: 'image/jpeg' });
      if (thumbErr) {
        console.warn('[chat] thumbnail upload failed (non-fatal)', thumbErr);
      } else {
        thumbnailPath = candidatePath;
      }
    }
  } catch (e) {
    console.warn('[chat] thumb generation failed (non-fatal)', e);
  }

  const { error } = await supabase.storage.from(bucket).upload(path, uploadBlob, { contentType: uploadMime });
  if (error) {
    // Main upload failed — if we uploaded a thumbnail moments ago, remove it
    // so we do not leak orphaned storage objects. Surface any cleanup failure
    // so the developer can see it, but do not swallow the original error.
    if (thumbnailPath) {
      try {
        const { error: rmErr } = await supabase.storage.from(bucket).remove([thumbnailPath]);
        if (rmErr) console.error('[chat] orphan thumbnail cleanup failed', thumbnailPath, rmErr);
      } catch (rmErr) {
        console.error('[chat] orphan thumbnail cleanup threw', thumbnailPath, rmErr);
      }
    }
    throw new Error(`Opplasting feilet: ${error.message}`);
  }

  // NEW stored attachment — persist ONLY stable coordinates. No public URL,
  // no signed URL, no blob URL. Renderers resolve via SignedMedia.
  return {
    id: att.id,
    kind: att.kind,
    objectUrl: '',
    filename: file.name,
    mime: uploadMime,
    size: uploadBlob.size,
    storageBucket: bucket,
    storagePath: path,
    thumbnailPath,
    // file is intentionally omitted so retries do not re-upload.
  };
}

/**
 * Upload only what still needs uploading. Persists each individual success
 * back to the pending item immediately, so a later retry never re-uploads
 * something that already succeeded on a previous attempt.
 */
async function uploadAttachmentsForPending(p: PendingSend): Promise<Attachment[]> {
  // Snapshot original order.
  const originalOrder = p.attachments.map((a) => a.id);
  const queue = [...p.attachments].filter((att) => attachmentsNeedingUpload([att]).length > 0);
  // Two workers keeps mobile memory bounded while avoiding one full network
  // round-trip per attachment when several photos are sent together.
  const worker = async () => {
    while (queue.length > 0) {
      const att = queue.shift();
      if (!att) return;
      const uploaded = await uploadOne(att, p.senderId);
      p.attachments = p.attachments.map((item) => (item.id === att.id ? uploaded : item));
    }
  };
  await Promise.all([worker(), worker()]);
  const done = attachmentsAlreadyUploaded(p.attachments);
  const byId = new Map<string, Attachment>();
  done.forEach((a) => byId.set(a.id, a));
  // Reconstruct in original order.
  const merged = originalOrder.map((id) => byId.get(id) || p.attachments.find((a) => a.id === id)!);
  p.attachments = merged;
  return merged;
}


export async function sendMessage(
  text: string,
  attachments: Attachment[] = [],
  senderId?: string,
  senderName?: string,
): Promise<Message> {
  if (!currentTripId) throw new Error('Ingen aktiv tur valgt');
  if (currentIsArchive) throw new Error('Arkiv – skrivebeskyttet');
  const sid = senderId || (await getCurrentUserId());
  let sname = senderName;
  if (!sname) {
    const { data: profile } = await supabase.from('profiles').select('nickname, full_name').eq('id', sid).maybeSingle();
    sname = profile?.nickname || profile?.full_name || 'Ukjent';
  }
  const clientId = crypto.randomUUID();
  const replyToId = replyTo?.id || null;
  if (replyTo) setReplyTo(null);

  const pending: PendingSend = { clientId, text, attachments, senderId: sid, senderName: sname, replyToId };
  pendingByClientId.set(clientId, pending);

  const now = Date.now();
  const src = replyToId ? state.byId.get(replyToId) : undefined;
  const optimistic: Message = {
    id: clientId,
    clientId,
    text,
    createdAt: now,
    senderName: sname,
    senderId: sid,
    attachments,
    deliveryState: 'sending',
    replyTo: replyToId
      ? mapReplyPreview(replyToId, src ? {
          id: src.id,
          text: src.text,
          senderName: src.senderName,
          deletedAt: src.deletedAt ?? null,
        } : undefined)
      : null,
  };
  state.optimistic.set(clientId, optimistic);
  notify();

  // Fire and forget — the composer must not stay blocked while the network work runs.
  performSend(clientId).catch((e) => console.error('[chat] performSend', e));
  return optimistic;
}

async function performSend(clientId: string): Promise<Message | null> {
  const p = pendingByClientId.get(clientId);
  if (!p) return null;

  try {
    const uploaded = await uploadAttachmentsForPending(p);
    const insertId = clientId; // reuse client id as row id for idempotency

    let data: Record<string, unknown> | null = null;
    // Serialize attachments: NEW stored attachments are persisted with stable
    // coordinates only; historical/external attachments preserve legacy URLs.
    const serializedAtts = uploaded.map(serializeAttachmentForPersist);
    const insertRes = await supabase
      .from('messages')
      .insert({
        id: insertId,
        text: p.text.trim(),
        thread_id: DEFAULT_THREAD_ID,
        sender_id: p.senderId,
        sender_name: p.senderName,
        attachments: serializedAtts as unknown as never,
        reply_to_id: p.replyToId,
      } as never)
      .select()
      .single();

    if (insertRes.error) {
      // Idempotent recovery: if the row already exists with our client id and
      // is owned by this sender, treat as success (the previous response was lost).
      // The uploaded stable objects are preserved — they'll be found by the
      // existing row and remain valid. We intentionally do NOT delete them.
      if (isDuplicateKeyError(insertRes.error)) {
        const existing = await supabase
          .from('messages')
          .select('*')
          .eq('id', insertId)
          .maybeSingle();
        if (existing.data && (existing.data as { sender_id: string }).sender_id === p.senderId) {
          data = existing.data as unknown as Record<string, unknown>;
        } else {
          throw insertRes.error;
        }
      } else {
        throw insertRes.error;
      }
    } else {
      data = insertRes.data as unknown as Record<string, unknown>;
    }

    const row = data!;
    const msg = dbToMessage(row);
    if (p.replyToId) {
      const src = state.byId.get(p.replyToId);
      msg.replyTo = mapReplyPreview(
        p.replyToId,
        src ? {
          id: src.id,
          text: src.text,
          senderName: src.senderName,
          deletedAt: src.deletedAt ?? null,
        } : undefined,
      );
    }
    state.byId.set(msg.id, msg);
    state.optimistic.delete(clientId);
    pendingByClientId.delete(clientId);
    revokeLocalObjectUrls(p.attachments);
    notify();

    // Mirror media attachments into the normalized attachments table so gallery
    // sync runs and future consumers can query by (bucket, path). We upsert on
    // (message_id, storage_path) so a recovered duplicate send does not create
    // duplicate mirror rows. Mirror failure must NOT turn the message failed —
    // the message insert already succeeded and it's the source of truth.
    try {
      const rows = (uploaded || [])
        .filter((a) => (a.kind === 'image' || a.kind === 'video' || a.kind === 'gif') && a.storageBucket && a.storagePath)
        .map((a) => ({
          message_id: msg.id,
          type: a.kind,
          storage_bucket: a.storageBucket!,
          storage_path: a.storagePath!,
          thumbnail_path: a.thumbnailPath ?? null,
          filename: a.filename ?? null,
          mime_type: a.mime ?? null,
          file_size: a.size ?? null,
        }));
      if (rows.length > 0) {
        const { error: mirrorErr } = await supabase
          .from('attachments')
          .upsert(rows as never, { onConflict: 'message_id,storage_path', ignoreDuplicates: true });
        if (mirrorErr) {
          console.warn('[chat] attachments mirror upsert error', mirrorErr);
        }
      }
    } catch (e) {
      console.warn('[chat] attachments mirror failed', e);
    }

    // Fire push after successful insert (skip on recovered dup, still safe).
    try {
      const { oneSignalService } = await import('@/services/onesignal');
      await oneSignalService.triggerPushNotification(DEFAULT_THREAD_ID, p.senderId, msg.id);
    } catch (e) {
      console.warn('[chat] push failed', e);
    }

    return msg;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Ukjent feil';
    const opt = state.optimistic.get(clientId);
    if (opt) {
      state.optimistic.set(clientId, { ...opt, deliveryState: 'failed', errorMessage });
      notify();
    }
    console.error('[chat] send failed', err);
    return null;
  }
}

export async function retrySend(clientId: string): Promise<void> {
  const opt = state.optimistic.get(clientId);
  if (!opt) return;
  state.optimistic.set(clientId, { ...opt, deliveryState: 'sending', errorMessage: undefined });
  notify();
  await performSend(clientId);
}

export function discardFailed(clientId: string): void {
  // Explicit user-initiated discard of a failed pending message. This is the
  // only path where it is safe to clean up uploaded storage objects, because
  // the user has decided this message will never be retried. Duplicate-key
  // recovery inside performSend takes a different path and preserves objects.
  const pending = pendingByClientId.get(clientId);
  if (pending) {
    const paths: string[] = [];
    for (const a of pending.attachments) {
      if (a.storageBucket === 'chat-media' && a.storagePath) paths.push(a.storagePath);
      if (a.storageBucket === 'chat-media' && a.thumbnailPath) paths.push(a.thumbnailPath);
    }
    if (paths.length > 0) {
      supabase.storage.from('chat-media').remove(paths).then(({ error }) => {
        if (error) console.error('[chat] discard cleanup failed', paths, error);
      });
    }
    revokeLocalObjectUrls(pending.attachments);
  }
  state.optimistic.delete(clientId);
  pendingByClientId.delete(clientId);
  notify();
}

// ============ Edit / Delete ============
export async function editMessage(messageId: string, newText: string): Promise<void> {
  const previous = state.byId.get(messageId);
  const editedAt = Date.now();
  if (previous) {
    state.byId.set(messageId, { ...previous, text: newText.trim(), editedAt });
    notify();
  }
  const { error } = await supabase
    .from('messages')
    .update({ text: newText.trim(), edited_at: new Date(editedAt).toISOString() })
    .eq('id', messageId);
  if (error) {
    if (previous) { state.byId.set(messageId, previous); notify(); }
    throw error;
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const previous = state.byId.get(messageId);
  const deletedAt = Date.now();
  if (previous) {
    state.byId.set(messageId, { ...previous, deletedAt });
    notify();
  }
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date(deletedAt).toISOString() })
    .eq('id', messageId);
  if (error) {
    if (previous) { state.byId.set(messageId, previous); notify(); }
    throw error;
  }
}

// ============ Reactions (table-backed) ============
export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const uid = await getCurrentUserId();
  let map = state.reactionsByMessage.get(messageId);
  const current = map?.get(uid);
  if (current === emoji) {
    // Optimistic remove.
    if (map) {
      map.delete(uid);
      state.everHadNormalized.add(messageId);
      notify();
    }
    const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', uid);
    if (error) {
      // Roll back on failure.
      if (map && current) map.set(uid, current);
      notify();
      throw error;
    }
    return;
  }
  // Optimistic upsert.
  if (!map) { map = new Map(); state.reactionsByMessage.set(messageId, map); }
  const prev = map.get(uid);
  map.set(uid, emoji);
  state.everHadNormalized.add(messageId);
  notify();
  const { error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: uid, emoji }, { onConflict: 'message_id,user_id' });
  if (error) {
    if (prev === undefined) map.delete(uid);
    else map.set(uid, prev);
    notify();
    throw error;
  }
}


// ============ Reply state ============
export function setReplyTo(preview: ReplyPreview | null) {
  replyTo = preview;
  replySubs.forEach((s) => s(replyTo));
}
export function getReplyTo(): ReplyPreview | null { return replyTo; }
export function subscribeToReplyTo(cb: (r: ReplyPreview | null) => void): () => void {
  replySubs.add(cb);
  cb(replyTo);
  return () => { replySubs.delete(cb); };
}

// ============ Typing (Supabase Realtime Broadcast, private channel) ============
type TypingSub = (state: TypingState) => void;
const typingSubs = new Set<TypingSub>();
const remoteTyping = new Map<string, { name: string; at: number }>();
let localTypingLastSent = 0;
let typingChannel: ReturnType<typeof supabase.channel> | null = null;
let typingChannelReady = false;
let typingSweepTimer: ReturnType<typeof setInterval> | null = null;
let selfUid: string | null = null;

function typingSnapshot(): TypingState {
  const now = Date.now();
  const users: { id: string; name: string }[] = [];
  for (const [id, v] of remoteTyping) {
    if (now - v.at < TYPING_TTL_MS) users.push({ id, name: v.name });
    else remoteTyping.delete(id);
  }
  return { isTyping: users.length > 0, lastTypedAt: now, users };
}

function ensureTypingChannel() {
  if (typingChannel) return typingChannel;
  typingChannel = supabase.channel(
    `chat-typing-${DEFAULT_THREAD_ID}`,
    { config: { broadcast: { self: false }, private: true } as never },
  );
  typingChannel.on('broadcast', { event: 'typing' }, (payload) => {
    const p = (payload.payload || {}) as { id?: string; name?: string; typing?: boolean };
    if (!p.id || !selfUid || p.id === selfUid) return;
    if (p.typing === false) remoteTyping.delete(p.id);
    else remoteTyping.set(p.id, { name: p.name || 'Noen', at: Date.now() });
    typingSubs.forEach((s) => s(typingSnapshot()));
  });
  typingChannel.subscribe((status) => {
    typingChannelReady = status === 'SUBSCRIBED';
  });
  if (!typingSweepTimer) {
    typingSweepTimer = setInterval(() => {
      if (typingSubs.size === 0) return;
      const before = remoteTyping.size;
      typingSnapshot();
      if (remoteTyping.size !== before) typingSubs.forEach((s) => s(typingSnapshot()));
    }, 1000);
  }
  return typingChannel;
}

function teardownTypingIfIdle() {
  if (typingSubs.size !== 0) return;
  if (typingSweepTimer) { clearInterval(typingSweepTimer); typingSweepTimer = null; }
  if (typingChannel) {
    supabase.removeChannel(typingChannel);
    typingChannel = null;
    typingChannelReady = false;
    remoteTyping.clear();
  }
}

export function setTyping(isTyping: boolean, meta?: { id: string; name: string }) {
  ensureTypingChannel();
  if (!meta) return;
  selfUid = meta.id;
  const now = Date.now();
  if (isTyping && now - localTypingLastSent < 800) return; // throttle starts, never stops
  if (isTyping) localTypingLastSent = now;
  if (typingChannel && typingChannelReady) {
    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { id: meta.id, name: meta.name, typing: isTyping },
    });
  }
}

export function subscribeToTyping(callback: TypingSub): () => void {
  ensureTypingChannel();
  typingSubs.add(callback);
  callback(typingSnapshot());
  return () => {
    typingSubs.delete(callback);
    teardownTypingIfIdle();
  };
}

export function getTypingState(): TypingState { return typingSnapshot(); }

// ============ Export ============
export const chatStore = {
  getUser,
  setUserName,
  listMessages,
  sendMessage,
  retrySend,
  discardFailed,
  editMessage,
  deleteMessage,
  toggleReaction,
  setTyping,
  getTypingState,
  subscribeToTyping,
  subscribeToMessages,
  subscribeToChannelStatus,
  loadEarlier,
  ensureMessageLoaded,
  setReplyTo,
  getReplyTo,
  subscribeToReplyTo,
};
