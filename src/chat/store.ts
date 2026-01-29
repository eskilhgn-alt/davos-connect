/**
 * Chat Store - localStorage-based persistence
 * Simple, robust, no external dependencies
 */

import type { Message, User, Attachment } from './types';

const STORAGE_KEYS = {
  MESSAGES: 'chat_messages',
  USER: 'chat_user',
} as const;

const CHAT_UPDATE_EVENT = 'chat:updated';

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

export function deleteMessage(messageId: string): void {
  const messages = listMessages().filter(m => m.id !== messageId);
  saveMessages(messages);
}

export function editMessage(messageId: string, newText: string): void {
  const messages = listMessages();
  const idx = messages.findIndex(m => m.id === messageId);
  if (idx !== -1) {
    messages[idx] = { ...messages[idx], text: newText.trim() };
    saveMessages(messages);
  }
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
  listMessages,
  sendMessage,
  deleteMessage,
  editMessage,
  subscribeToMessages,
};
