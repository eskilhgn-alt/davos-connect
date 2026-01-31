/**
 * Chat Types - Extended for reactions, edit, delete
 * Backward compatible with existing data
 */

export interface Message {
  id: string;
  text: string;
  createdAt: number;
  senderName: string;
  senderId: string;
  attachments: Attachment[];
  // New fields (optional for backward compat)
  editedAt?: number;
  deletedAt?: number;
  reactions?: Record<string, string[]>; // emoji -> array of senderIds
}

export interface Attachment {
  id: string;
  kind: 'image' | 'video' | 'gif';
  objectUrl: string; // For immediate preview (or gif URL)
}

export interface User {
  id: string;
  name: string;
}

export interface TypingState {
  isTyping: boolean;
  lastTypedAt: number;
}
