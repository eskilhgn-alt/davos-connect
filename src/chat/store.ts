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
  type Cursor,
} from './logic';


const DEFAULT_THREAD_ID = '00000000-0000-0000-0000-000000000001';
const INITIAL_PAGE = 50;
const PAGE_SIZE = 50;
const TYPING_TTL_MS = 3000;
// Bounded deep-link paging: at most this many extra pages to find the target id.
const MAX_DEEP_LINK_PAGES = 40;

// ============ Auth ============
async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

// ============ Mapping ============
function dbToMessage(row: Record<string, unknown>): Message {
  const attsRaw = Array.isArray(row.attachments) ? row.attachments : [];
  const attachments: Attachment[] = attsRaw.map((a: Record<string, unknown>) => ({
    id: (a.id as string) || crypto.randomUUID(),
    kind: (a.kind as Attachment['kind']) || 'image',
    objectUrl: (a.objectUrl as string) || (a.url as string) || '',
    thumbUrl: a.thumbUrl as string | undefined,
    filename: a.filename as string | undefined,
    mime: a.mime as string | undefined,
    size: a.size as number | undefined,
    poll_id: a.poll_id as string | undefined,
    poll_event: a.poll_event as string | undefined,
  }));

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
  for (const r of data || []) {
    let map = state.reactionsByMessage.get(r.message_id);
    if (!map) {
      map = new Map();
      state.reactionsByMessage.set(r.message_id, map);
    }
    map.set(r.user_id, r.emoji);
    state.everHadNormalized.add(r.message_id);
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
  state.loading = true;
  const limit = beforeCursor ? PAGE_SIZE : INITIAL_PAGE;

  // Deterministic (created_at DESC, id DESC) ordering with (created_at,id) cursor.
  // We select limit+1 candidates and drop entries not strictly before the cursor
  // client-side, because PostgREST does not support composite tuple comparison.
  let q = supabase
    .from('messages')
    .select('*')
    .eq('thread_id', DEFAULT_THREAD_ID)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + (beforeCursor ? 5 : 0));
  if (beforeCursor) {
    // Loose filter (<=) then strict filter client-side.
    q = q.lte('created_at', new Date(beforeCursor.createdAt).toISOString());
  }
  const { data, error } = await q;
  state.loading = false;
  if (error) {
    console.error('[chat] loadPage failed', error);
    return 0;
  }
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const messages = rows.map(dbToMessage);
  // Apply strict cursor filter client-side.
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
  }
  const pageSlice = filtered.slice(0, limit);
  const pageRowsSlice = filteredRows.slice(0, limit);
  await fetchReplyPreviews(pageSlice, pageRowsSlice);
  for (const m of pageSlice) state.byId.set(m.id, m);
  const newCursor = oldestCursor(pageSlice.length ? pageSlice : []);
  if (newCursor) {
    if (!state.cursor || isBeforeCursor(newCursor, state.cursor)) {
      state.cursor = newCursor;
    }
  }
  // If the raw query already returned fewer rows than the limit, there is nothing older.
  state.hasMore = messages.length >= limit;
  await fetchReactionsFor(pageSlice.map((m) => m.id));
  return pageSlice.length;
}

export async function loadEarlier(): Promise<{ loaded: number; hasMore: boolean }> {
  if (state.loading || !state.hasMore || state.cursor == null) {
    return { loaded: 0, hasMore: state.hasMore };
  }
  const loaded = await loadPage(state.cursor);
  notify();
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
  await fetchReplyPreviews([msg], [row]);
  state.byId.set(msg.id, msg);
  for (const [cid, opt] of state.optimistic) {
    if (opt.id === msg.id) state.optimistic.delete(cid);
  }
  await fetchReactionsFor([msg.id]);
  notify();
}
function applyUpdate(row: Record<string, unknown>) {
  const msg = dbToMessage(row);
  const existing = state.byId.get(msg.id);
  if (existing?.replyTo) msg.replyTo = existing.replyTo;
  state.byId.set(msg.id, msg);
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
export function subscribeToMessages(callback: Sub): () => void {
  subs.add(callback);
  if (state.byId.size === 0 && !state.loading) {
    loadPage().then(() => notify()).catch((e) => console.error('[chat] initial load', e));
  } else {
    callback(sortedMessages());
  }

  if (!messageChannel) {
    notifyStatus('connecting');
    messageChannel = supabase
      .channel('chat-messages-rt')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${DEFAULT_THREAD_ID}` },
        (p) => { applyInsert(p.new as Record<string, unknown>).catch(console.error); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `thread_id=eq.${DEFAULT_THREAD_ID}` },
        (p) => applyUpdate(p.new as Record<string, unknown>))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => applyDelete(p.old as Record<string, unknown>))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (p) => applyReactionChange(p.eventType, p.new as Record<string, unknown> | null, p.old as Record<string, unknown> | null))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') notifyStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') notifyStatus('reconnecting');
        else if (status === 'CLOSED') notifyStatus('offline');
      });
  }

  return () => {
    subs.delete(callback);
    if (subs.size === 0 && messageChannel) {
      supabase.removeChannel(messageChannel);
      messageChannel = null;
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

async function uploadOne(att: Attachment, senderId: string): Promise<Attachment> {
  // Already uploaded on a previous attempt — nothing to do.
  if (!att.file || !att.objectUrl.startsWith('blob:')) {
    return { ...att, file: undefined };
  }
  const file = att.file;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const fileId = crypto.randomUUID();
  const path = `${senderId}/${fileId}.${ext}`;

  let thumbUrl: string | undefined;
  if (att.kind === 'image' && file.type.startsWith('image/')) {
    try {
      const { createThumbnail } = await import('@/utils/imageThumb');
      const result = await createThumbnail(file);
      const thumbPath = `${senderId}/${fileId}_thumb.jpg`;
      await supabase.storage.from('chat-media').upload(thumbPath, result.thumbBlob, { contentType: 'image/jpeg' });
      const { data: thumbData } = supabase.storage.from('chat-media').getPublicUrl(thumbPath);
      thumbUrl = thumbData.publicUrl;
    } catch (e) {
      console.warn('[chat] thumb failed', e);
    }
  }

  const { error } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Opplasting feilet: ${error.message}`);
  const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
  return {
    id: att.id,
    kind: att.kind,
    objectUrl: urlData.publicUrl,
    thumbUrl,
    filename: file.name,
    mime: file.type,
    size: file.size,
    // file is intentionally omitted so retries do not re-upload.
  };
}

/**
 * Upload only what still needs uploading. Mutates the pending item in place so
 * subsequent retries never re-upload already-persisted attachments.
 */
async function uploadAttachmentsForPending(p: PendingSend): Promise<Attachment[]> {
  const needsUpload = attachmentsNeedingUpload(p.attachments);
  const alreadyDone = attachmentsAlreadyUploaded(p.attachments);
  const uploaded = await Promise.all(needsUpload.map((a) => uploadOne(a, p.senderId)));
  // Merge back preserving original order by id.
  const byId = new Map<string, Attachment>();
  [...alreadyDone, ...uploaded].forEach((a) => byId.set(a.id, a));
  const merged = p.attachments.map((a) => byId.get(a.id) || a);
  // Persist metadata so future retries skip these uploads.
  p.attachments = merged;
  return merged;
}

export async function sendMessage(
  text: string,
  attachments: Attachment[] = [],
  senderId?: string,
  senderName?: string,
): Promise<Message> {
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
    const insertRes = await supabase
      .from('messages')
      .insert({
        id: insertId,
        text: p.text.trim(),
        thread_id: DEFAULT_THREAD_ID,
        sender_id: p.senderId,
        sender_name: p.senderName,
        attachments: uploaded as unknown as never,
        reply_to_id: p.replyToId,
      } as never)
      .select()
      .single();

    if (insertRes.error) {
      // Idempotent recovery: if the row already exists with our client id and
      // is owned by this sender, treat as success (the previous response was lost).
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
    notify();

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
  state.optimistic.delete(clientId);
  pendingByClientId.delete(clientId);
  notify();
}

// ============ Edit / Delete ============
export async function editMessage(messageId: string, newText: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ text: newText.trim(), edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

// ============ Reactions (table-backed) ============
export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const uid = await getCurrentUserId();
  const current = state.reactionsByMessage.get(messageId)?.get(uid);
  if (current === emoji) {
    const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', uid);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: uid, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
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
    const p = (payload.payload || {}) as { id?: string; name?: string };
    if (!p.id || !selfUid || p.id === selfUid) return;
    remoteTyping.set(p.id, { name: p.name || 'Noen', at: Date.now() });
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
  if (!isTyping) return;
  const now = Date.now();
  if (now - localTypingLastSent < 800) return; // throttle
  localTypingLastSent = now;
  if (!meta) return;
  selfUid = meta.id;
  if (typingChannel && typingChannelReady) {
    typingChannel.send({ type: 'broadcast', event: 'typing', payload: { id: meta.id, name: meta.name } });
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
