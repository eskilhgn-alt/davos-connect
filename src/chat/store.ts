/**
 * Chat Store - Supabase-backed persistence with Realtime
 * Replaces localStorage with server-authoritative data
 */

import { supabase } from '@/integrations/supabase/client';
import type { Message, Attachment, TypingState } from './types';

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";
const TYPING_UPDATE_EVENT = 'chat:typing';

// ============ Helpers ============

async function getCurrentUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Not authenticated');
  return session.user.id;
}

function dbToMessage(row: Record<string, unknown>): Message {
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id as string,
    text: (row.text as string) || '',
    createdAt: new Date(row.created_at as string).getTime(),
    senderName: row.sender_name as string,
    senderId: row.sender_id as string,
    attachments: attachments.map((a: Record<string, unknown>) => ({
      id: (a.id as string) || crypto.randomUUID(),
      kind: (a.kind as 'image' | 'video' | 'gif') || 'image',
      objectUrl: (a.objectUrl as string) || (a.url as string) || '',
    })),
    editedAt: row.edited_at ? new Date(row.edited_at as string).getTime() : undefined,
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string).getTime() : undefined,
    reactions: row.reactions && typeof row.reactions === 'object' && Object.keys(row.reactions as object).length > 0
      ? (row.reactions as Record<string, string[]>)
      : undefined,
  };
}

// ============ User Management (backward compat) ============

interface LocalUser {
  id: string;
  name: string;
}

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

// ============ Message Fetching ============

async function fetchMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', DEFAULT_THREAD_ID)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  return (data || []).map((row) => dbToMessage(row as unknown as Record<string, unknown>));
}

// ============ Message Subscription (Realtime) ============

export function subscribeToMessages(callback: (messages: Message[]) => void): () => void {
  let active = true;

  const refresh = async () => {
    const msgs = await fetchMessages();
    if (active) callback(msgs);
  };

  // Initial fetch
  refresh();

  // Realtime subscription
  const channel = supabase
    .channel('chat-messages-rt')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${DEFAULT_THREAD_ID}`,
      },
      () => { refresh(); }
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

// For backward compat (some components call this synchronously)
export function listMessages(): Message[] {
  // Return empty - callers should use subscribeToMessages instead
  return [];
}

// ============ Message Operations ============

export async function sendMessage(
  text: string,
  attachments: Attachment[] = [],
  senderId?: string,
  senderName?: string
): Promise<Message | null> {
  // Get sender info from auth if not provided
  let sid = senderId;
  let sname = senderName;
  if (!sid || !sname) {
    sid = await getCurrentUserId();
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, full_name')
      .eq('id', sid)
      .maybeSingle();
    sname = profile?.nickname || profile?.full_name || 'Ukjent';
  }

  // Upload file attachments to Storage
  const uploadedAttachments = await Promise.all(
    attachments.map(async (att) => {
      if (att.file) {
        const ext = att.file.name.split('.').pop() || 'jpg';
        const path = `${sid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from('chat-media')
          .upload(path, att.file, { contentType: att.file.type });

        if (error) {
          console.error('Upload failed:', error);
          return { id: att.id, kind: att.kind, objectUrl: att.objectUrl };
        }

        const { data: urlData } = supabase.storage
          .from('chat-media')
          .getPublicUrl(path);

        return { id: att.id, kind: att.kind, objectUrl: urlData.publicUrl };
      }
      // GIFs already have external URLs
      return { id: att.id, kind: att.kind, objectUrl: att.objectUrl };
    })
  );

  const { data, error } = await supabase
    .from('messages')
    .insert({
      text: text.trim(),
      thread_id: DEFAULT_THREAD_ID,
      sender_id: sid,
      sender_name: sname,
      attachments: uploadedAttachments,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    return null;
  }

  return data ? dbToMessage(data as unknown as Record<string, unknown>) : null;
}

export async function editMessage(messageId: string, newText: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({
      text: newText.trim(),
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId);

  if (error) console.error('Error editing message:', error);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);

  if (error) console.error('Error deleting message:', error);
}

export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const userId = await getCurrentUserId();

  const { data } = await supabase
    .from('messages')
    .select('reactions')
    .eq('id', messageId)
    .single();

  const reactions = (data?.reactions as Record<string, string[]>) || {};
  const emojiReactions = reactions[emoji] || [];

  const userIdx = emojiReactions.indexOf(userId);
  if (userIdx === -1) {
    reactions[emoji] = [...emojiReactions, userId];
  } else {
    reactions[emoji] = emojiReactions.filter(id => id !== userId);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  }

  const { error } = await supabase
    .from('messages')
    .update({ reactions: Object.keys(reactions).length > 0 ? reactions : {} })
    .eq('id', messageId);

  if (error) console.error('Error toggling reaction:', error);
}

// ============ Typing State (local only - ephemeral) ============

let typingTimeout: ReturnType<typeof setTimeout> | null = null;
let typingState: TypingState = { isTyping: false, lastTypedAt: 0 };

export function setTyping(isTyping: boolean): void {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  if (isTyping) {
    typingState = { isTyping: true, lastTypedAt: Date.now() };
    typingTimeout = setTimeout(() => {
      typingState = { isTyping: false, lastTypedAt: Date.now() };
      window.dispatchEvent(new CustomEvent(TYPING_UPDATE_EVENT));
    }, 1500);
  } else {
    typingState = { isTyping: false, lastTypedAt: Date.now() };
  }

  window.dispatchEvent(new CustomEvent(TYPING_UPDATE_EVENT));
}

export function getTypingState(): TypingState {
  return typingState;
}

export function subscribeToTyping(callback: (state: TypingState) => void): () => void {
  const handler = () => callback(getTypingState());
  window.addEventListener(TYPING_UPDATE_EVENT, handler);
  return () => window.removeEventListener(TYPING_UPDATE_EVENT, handler);
}

// ============ Export ============

export const chatStore = {
  getUser,
  setUserName,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  setTyping,
  getTypingState,
  subscribeToTyping,
  subscribeToMessages,
};
