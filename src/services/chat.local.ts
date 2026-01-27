/**
 * Local Chat Service Implementation
 * Uses localStorage for messages and thread metadata
 * Event-driven updates (no polling)
 */

import type { LocalMessage, LocalThread, MessageAttachment, MessageStatus } from './contracts';
import { galleryService } from './gallery.local';

const STORAGE_KEYS = {
  MESSAGES: 'davos_messages',
  THREADS: 'davos_threads',
} as const;

// Custom event name for same-tab updates
const CHAT_UPDATED_EVENT = 'liftlager:chat-updated';

// Default thread for the app
const DEFAULT_THREAD: LocalThread = {
  id: 'davos-crew',
  title: 'Davos Crew',
  participantIds: [],
};

// Helper to get data from localStorage
function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Helper to save data to localStorage and dispatch update event
function saveStoredData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // Dispatch custom event for same-tab listeners
    window.dispatchEvent(new CustomEvent(CHAT_UPDATED_EVENT, { detail: { key } }));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

// Get thread (returns default Davos crew thread)
export function getThread(): LocalThread {
  const threads = getStoredData<LocalThread[]>(STORAGE_KEYS.THREADS, [DEFAULT_THREAD]);
  return threads.find(t => t.id === 'davos-crew') || DEFAULT_THREAD;
}

// List all messages for a thread
export function listMessages(threadId: string): LocalMessage[] {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  return messages
    .filter(m => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Send a new message
export function sendMessage(
  threadId: string,
  payload: {
    senderId: string;
    senderName: string;
    text: string;
    attachments?: MessageAttachment[];
  }
): LocalMessage {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  
  const newMessage: LocalMessage = {
    id: crypto.randomUUID(),
    threadId,
    senderId: payload.senderId,
    senderName: payload.senderName,
    text: payload.text,
    createdAt: Date.now(),
    status: 'sent',
    attachments: payload.attachments || [],
    reactions: {},
  };
  
  messages.push(newMessage);
  saveStoredData(STORAGE_KEYS.MESSAGES, messages);
  
  // Add attachments to gallery index
  if (newMessage.attachments.length > 0) {
    galleryService.addFromMessage(newMessage);
  }
  
  return newMessage;
}

// Edit a message
export function editMessage(messageId: string, newText: string): LocalMessage | null {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const index = messages.findIndex(m => m.id === messageId);
  
  if (index === -1) return null;
  
  messages[index] = {
    ...messages[index],
    text: newText,
    editedAt: Date.now(),
  };
  
  saveStoredData(STORAGE_KEYS.MESSAGES, messages);
  return messages[index];
}

// Soft delete a message
export function deleteMessage(messageId: string): LocalMessage | null {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const index = messages.findIndex(m => m.id === messageId);
  
  if (index === -1) return null;
  
  messages[index] = {
    ...messages[index],
    deletedAt: Date.now(),
  };
  
  saveStoredData(STORAGE_KEYS.MESSAGES, messages);
  return messages[index];
}

// Toggle reaction on a message
export function toggleReaction(
  messageId: string,
  emoji: string,
  userId: string
): LocalMessage | null {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const index = messages.findIndex(m => m.id === messageId);
  
  if (index === -1) return null;
  
  const message = messages[index];
  const reactions = { ...message.reactions };
  const usersForEmoji = reactions[emoji] || [];
  
  if (usersForEmoji.includes(userId)) {
    // Remove reaction
    reactions[emoji] = usersForEmoji.filter(id => id !== userId);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    // Add reaction
    reactions[emoji] = [...usersForEmoji, userId];
  }
  
  messages[index] = { ...message, reactions };
  saveStoredData(STORAGE_KEYS.MESSAGES, messages);
  
  return messages[index];
}

// Update message status
export function updateMessageStatus(
  messageId: string,
  status: MessageStatus
): LocalMessage | null {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const index = messages.findIndex(m => m.id === messageId);
  
  if (index === -1) return null;
  
  messages[index] = { ...messages[index], status };
  saveStoredData(STORAGE_KEYS.MESSAGES, messages);
  
  return messages[index];
}

// Get a single message by ID
export function getMessage(messageId: string): LocalMessage | null {
  const messages = getStoredData<LocalMessage[]>(STORAGE_KEYS.MESSAGES, []);
  return messages.find(m => m.id === messageId) || null;
}

// Subscribe to message changes (event-driven, no polling)
export function subscribeToMessages(
  threadId: string,
  callback: (messages: LocalMessage[]) => void
): () => void {
  let isMounted = true;

  const notifyChange = () => {
    if (isMounted) {
      callback(listMessages(threadId));
    }
  };
  
  // Initial call
  notifyChange();
  
  // Listen for same-tab updates via custom event
  const handleChatUpdated = () => {
    notifyChange();
  };
  window.addEventListener(CHAT_UPDATED_EVENT, handleChatUpdated);
  
  // Listen for cross-tab updates via storage event
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.MESSAGES) {
      notifyChange();
    }
  };
  window.addEventListener('storage', handleStorage);
  
  // Cleanup function
  return () => {
    isMounted = false;
    window.removeEventListener(CHAT_UPDATED_EVENT, handleChatUpdated);
    window.removeEventListener('storage', handleStorage);
  };
}

// Export all functions as a service object
export const localChatService = {
  getThread,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  updateMessageStatus,
  getMessage,
  subscribeToMessages,
};
