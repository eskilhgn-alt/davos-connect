/**
 * Chat Types - Clean Room Implementation
 * Minimal, focused types for local chat
 */

export interface Message {
  id: string;
  text: string;
  createdAt: number;
  senderName: string;
  senderId: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  kind: 'image' | 'video';
  objectUrl: string; // For immediate preview
}

export interface User {
  id: string;
  name: string;
}
