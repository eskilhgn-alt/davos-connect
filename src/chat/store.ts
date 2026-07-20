/**
 * Chat Store – incremental realtime, optimistic sends, reactions table, reply, typing broadcast.
 *
 * Backward compatible with existing 21 messages: legacy messages.reactions JSONB is used as
 * fallback only when no rows exist in message_reactions for a given message.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Message, Attachment, TypingState, ReplyPreview, DeliveryState } from './types';

const DEFAULT_THREAD_ID = '00000000-0000-0000-0000-000000000001';
const INITIAL_PAGE = 50;
const PAGE_SIZE = 50;
const TYPING_TTL_MS = 3000;

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

  // Legacy JSONB reactions as fallback – overwritten by table rows when present.
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

interface StoreState {
  byId: Map<string, Message>;              // real DB messages
  optimistic: Map<string, Message>;        // clientId -> optimistic pending/failed
  reactionsByMessage: Map<string, Map<string, string>>; // messageId -> (userId -> emoji)
  oldestCreatedAt: number | null;
  hasMore: boolean;
  loading: boolean;
}

const state: StoreState = {
  byId: new Map(),
  optimistic: new Map(),
  reactionsByMessage: new Map(),
  oldestCreatedAt: null,
  hasMore: true,
  loading: false,
};

const subs = new Set<Sub>();
let replyTo: ReplyPreview | null = null;
const replySubs = new Set<(r: ReplyPreview | null) => void>();

function sortedMessages(): Message[] {
  const all: Message[] = [];
  for (const m of state.byId.values()) {
    const reactMap = state.reactionsByMessage.get(m.id);
    let reactions = m.reactions;
    if (reactMap && reactMap.size > 0) {
      reactions = {};
      for (const [uid, emoji] of reactMap) {
        if (!reactions[emoji]) reactions[emoji] = [];
        reactions[emoji].push(uid);
      }
    }
    all.push({ ...m, reactions });
  }
  for (const m of state.optimistic.values()) all.push(m);
  all.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
  return all;
}

function notify() {
  const snapshot = sortedMessages();
  subs.forEach((s) => s(snapshot));
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
  const byId = new Map<string, { text: string; sender_name: string; deleted_at: string | null }>();
  for (const r of data || []) byId.set(r.id as string, r as { text: string; sender_name: string; deleted_at: string | null });
  for (let i = 0; i < messages.length; i++) {
    const rid = rows[i].reply_to_id as string | null;
    if (!rid) continue;
    const src = byId.get(rid);
    if (src) {
      messages[i].replyTo = {
        id: rid,
        text: src.deleted_at ? '' : (src.text || ''),
        senderName: src.sender_name,
        deleted: !!src.deleted_at,
      };
    } else {
      messages[i].replyTo = { id: rid, text: '', senderName: '', deleted: true };
    }
  }
}

// ============ Initial load / pagination ============
async function loadPage(beforeTs?: number): Promise<number> {
  state.loading = true;
  let q = supabase
    .from('messages')
    .select('*')
    .eq('thread_id', DEFAULT_THREAD_ID)
    .order('created_at', { ascending: false })
    .limit(beforeTs ? PAGE_SIZE : INITIAL_PAGE);
  if (beforeTs) q = q.lt('created_at', new Date(beforeTs).toISOString());
  const { data, error } = await q;
  state.loading = false;
  if (error) {
    console.error('[chat] loadPage failed', error);
    return 0;
  }
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const messages = rows.map(dbToMessage);
  await fetchReplyPreviews(messages, rows);
  for (const m of messages) state.byId.set(m.id, m);
  if (messages.length > 0) {
    const oldest = Math.min(...messages.map((m) => m.createdAt));
    state.oldestCreatedAt = state.oldestCreatedAt == null ? oldest : Math.min(state.oldestCreatedAt, oldest);
  }
  state.hasMore = messages.length >= (beforeTs ? PAGE_SIZE : INITIAL_PAGE);
  await fetchReactionsFor(messages.map((m) => m.id));
  return messages.length;
}

export async function loadEarlier(): Promise<{ loaded: number; hasMore: boolean }> {
  if (state.loading || !state.hasMore || state.oldestCreatedAt == null) {
    return { loaded: 0, hasMore: state.hasMore };
  }
  const loaded = await loadPage(state.oldestCreatedAt);
  notify();
  return { loaded, hasMore: state.hasMore };
}

// ============ Realtime ============
async function applyInsert(row: Record<string, unknown>) {
  const msg = dbToMessage(row);
  await fetchReplyPreviews([msg], [row]);
  state.byId.set(msg.id, msg);
  // Remove matching optimistic bubble if any
  for (const [cid, opt] of state.optimistic) {
    if (opt.id === msg.id) state.optimistic.delete(cid);
  }
  // Ensure reactions for this msg exist (usually empty)
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
  // Clear legacy fallback for this message when we now have table data
  const m = state.byId.get(mid);
  if (m && m.reactions) state.byId.set(mid, { ...m, reactions: undefined });
  notify();
}

// ============ Subscribe ============
export function subscribeToMessages(callback: Sub): () => void {
  subs.add(callback);
  // Initial load if empty
  if (state.byId.size === 0 && !state.loading) {
    loadPage().then(() => notify()).catch((e) => console.error('[chat] initial load', e));
  } else {
    callback(sortedMessages());
  }

  const channel = supabase
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
    .subscribe();

  return () => {
    subs.delete(callback);
    if (subs.size === 0) supabase.removeChannel(channel);
  };
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
  attachments: Attachment[];
  senderId: string;
  senderName: string;
  replyToId: string | null;
}

const pendingByClientId = new Map<string, PendingSend>();

async function uploadAttachments(atts: Attachment[], senderId: string): Promise<Attachment[]> {
  return Promise.all(atts.map(async (att) => {
    if (!att.file) return { ...att };
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
    };
  }));
}

export async function sendMessage(
  text: string,
  attachments: Attachment[] = [],
  senderId?: string,
  senderName?: string,
): Promise<Message | null> {
  const sid = senderId || (await getCurrentUserId());
  let sname = senderName;
  if (!sname) {
    const { data: profile } = await supabase.from('profiles').select('nickname, full_name').eq('id', sid).maybeSingle();
    sname = profile?.nickname || profile?.full_name || 'Ukjent';
  }
  const clientId = crypto.randomUUID();
  const replyToId = replyTo?.id || null;
  // Clear reply state now that it's captured on the send
  if (replyTo) setReplyTo(null);

  const pending: PendingSend = { clientId, text, attachments, senderId: sid, senderName: sname, replyToId };
  pendingByClientId.set(clientId, pending);

  // Optimistic bubble
  const now = Date.now();
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
      ? {
          id: replyToId,
          text: state.byId.get(replyToId)?.text || '',
          senderName: state.byId.get(replyToId)?.senderName || '',
          deleted: !!state.byId.get(replyToId)?.deletedAt,
        }
      : null,
  };
  state.optimistic.set(clientId, optimistic);
  notify();

  return performSend(clientId);
}

async function performSend(clientId: string): Promise<Message | null> {
  const p = pendingByClientId.get(clientId);
  if (!p) return null;

  try {
    const uploaded = await uploadAttachments(p.attachments, p.senderId);
    const insertId = clientId; // reuse client id as row id for idempotency
    const { data, error } = await supabase
      .from('messages')
      .insert({
        id: insertId,
        text: p.text.trim(),
        thread_id: DEFAULT_THREAD_ID,
        sender_id: p.senderId,
        sender_name: p.senderName,
        attachments: uploaded,
        reply_to_id: p.replyToId,
      })
      .select()
      .single();
    if (error) throw error;

    const row = data as unknown as Record<string, unknown>;
    const msg = dbToMessage(row);
    // Attach reply preview locally
    if (p.replyToId) {
      const src = state.byId.get(p.replyToId);
      msg.replyTo = src ? { id: src.id, text: src.deletedAt ? '' : src.text, senderName: src.senderName, deleted: !!src.deletedAt } : { id: p.replyToId, text: '', senderName: '', deleted: true };
    }
    state.byId.set(msg.id, msg);
    state.optimistic.delete(clientId);
    pendingByClientId.delete(clientId);
    notify();

    // Gallery inserts (best effort)
    for (const att of uploaded) {
      if (att.objectUrl?.includes('/chat-media/') && (att.kind === 'image' || att.kind === 'video' || att.kind === 'gif')) {
        const pathMatch = att.objectUrl.split('/chat-media/')[1];
        if (pathMatch) {
          supabase.from('gallery_items').insert({
            storage_path: decodeURIComponent(pathMatch),
            type: att.kind,
            uploaded_by: p.senderId,
            source_message_id: msg.id,
          }).then(({ error: gErr }) => { if (gErr) console.warn('gallery', gErr); });
        }
      }
    }

    // Fire push after successful insert
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

// ============ Typing (Supabase Realtime Broadcast) ============
type TypingSub = (state: TypingState) => void;
const typingSubs = new Set<TypingSub>();
const remoteTyping = new Map<string, { name: string; at: number }>();
let localTypingLastSent = 0;
let typingChannel: ReturnType<typeof supabase.channel> | null = null;
let typingChannelReady = false;
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
  typingChannel = supabase.channel(`chat-typing-${DEFAULT_THREAD_ID}`, {
    config: { broadcast: { self: false } },
  });
  typingChannel.on('broadcast', { event: 'typing' }, (payload) => {
    const p = (payload.payload || {}) as { id?: string; name?: string };
    if (!p.id || !selfUid || p.id === selfUid) return;
    remoteTyping.set(p.id, { name: p.name || 'Noen', at: Date.now() });
    typingSubs.forEach((s) => s(typingSnapshot()));
  });
  typingChannel.subscribe((status) => {
    typingChannelReady = status === 'SUBSCRIBED';
  });
  // TTL sweeper
  setInterval(() => {
    if (typingSubs.size === 0) return;
    const before = remoteTyping.size;
    typingSnapshot();
    if (remoteTyping.size !== before) typingSubs.forEach((s) => s(typingSnapshot()));
  }, 1000);
  return typingChannel;
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
  return () => { typingSubs.delete(callback); };
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
  loadEarlier,
  setReplyTo,
  getReplyTo,
  subscribeToReplyTo,
};
