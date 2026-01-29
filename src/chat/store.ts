/**
 * Chat Store - localStorage-based persistence
 * Extended for reactions, edit, delete, typing
 */

import type { Message, User, Attachment, TypingState } from './types';

const STORAGE_KEYS = {
  MESSAGES: 'chat_messages',
  USER: 'chat_user',
  TYPING: 'chat_typing',
} as const;

const CHAT_UPDATE_EVENT = 'chat:updated';
const TYPING_UPDATE_EVENT = 'chat:typing';

// ============ User Management ============

function generateUser(): User {
  return {
    id: crypto.randomUUID(),
    name: 'Meg',
  };
}

export function getUser(): User {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore
  }
  const user = generateUser();
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  return user;
}

export function setUserName(name: string): User {
  const user = getUser();
  user.name = name.trim() || 'Meg';
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  return user;
}

// ============ Message Management ============

export function listMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore
  }
  return [];
}

function saveMessages(messages: Message[]): void {
  localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  window.dispatchEvent(new CustomEvent(CHAT_UPDATE_EVENT));
}

export function sendMessage(text: string, attachments: Attachment[] = []): Message {
  const user = getUser();
  const message: Message = {
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: Date.now(),
    senderName: user.name,
    senderId: user.id,
    attachments,
  };
  
  const messages = listMessages();
  messages.push(message);
  saveMessages(messages);
  
  return message;
}

export function editMessage(messageId: string, newText: string): void {
  const messages = listMessages();
  const idx = messages.findIndex(m => m.id === messageId);
  if (idx !== -1 && !messages[idx].deletedAt) {
    messages[idx] = {
      ...messages[idx],
      text: newText.trim(),
      editedAt: Date.now(),
    };
    saveMessages(messages);
  }
}

export function deleteMessage(messageId: string): void {
  const messages = listMessages();
  const idx = messages.findIndex(m => m.id === messageId);
  if (idx !== -1) {
    // Soft delete - keep in list for stable rendering
    messages[idx] = {
      ...messages[idx],
      deletedAt: Date.now(),
    };
    saveMessages(messages);
  }
}

export function toggleReaction(messageId: string, emoji: string): void {
  const user = getUser();
  const messages = listMessages();
  const idx = messages.findIndex(m => m.id === messageId);
  
  if (idx !== -1 && !messages[idx].deletedAt) {
    const msg = messages[idx];
    const reactions = msg.reactions || {};
    const emojiReactions = reactions[emoji] || [];
    
    const userIdx = emojiReactions.indexOf(user.id);
    if (userIdx === -1) {
      // Add reaction
      reactions[emoji] = [...emojiReactions, user.id];
    } else {
      // Remove reaction
      reactions[emoji] = emojiReactions.filter(id => id !== user.id);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }
    
    messages[idx] = {
      ...msg,
      reactions: Object.keys(reactions).length > 0 ? reactions : undefined,
    };
    saveMessages(messages);
  }
}

// ============ Typing State ============

let typingTimeout: ReturnType<typeof setTimeout> | null = null;
let typingState: TypingState = { isTyping: false, lastTypedAt: 0 };

export function setTyping(isTyping: boolean): void {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  
  if (isTyping) {
    typingState = { isTyping: true, lastTypedAt: Date.now() };
    // Auto-clear after 1.5s of no activity
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

// ============ Subscription ============

export function subscribeToMessages(callback: (messages: Message[]) => void): () => void {
  // Initial call
  callback(listMessages());
  
  const handler = () => callback(listMessages());
  
  // Same-tab updates
  window.addEventListener(CHAT_UPDATE_EVENT, handler);
  
  // Cross-tab updates
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.MESSAGES) {
      handler();
    }
  };
  window.addEventListener('storage', storageHandler);
  
  return () => {
    window.removeEventListener(CHAT_UPDATE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

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
