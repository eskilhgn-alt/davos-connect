/**
 * Chat Types – reactions, reply, delivery state, files
 */

export interface SeenByEntry {
  userId: string;
  name: string;
  seenAt: string;
}

export type DeliveryState = 'sending' | 'sent' | 'failed';

export interface ReplyPreview {
  id: string;
  text: string;
  senderName: string;
  deleted?: boolean;
}

export interface Message {
  id: string;
  text: string;
  createdAt: number;
  senderName: string;
  senderId: string;
  attachments: Attachment[];
  editedAt?: number;
  deletedAt?: number;
  reactions?: Record<string, string[]>; // emoji -> array of userIds (from message_reactions table)
  seenBy?: SeenByEntry[];
  replyTo?: ReplyPreview | null;
  // Client-side only
  clientId?: string;
  deliveryState?: DeliveryState;
  errorMessage?: string;
}

export interface Attachment {
  id: string;
  kind: 'image' | 'video' | 'gif' | 'file';
  /**
   * Legacy / rollback field. Active code prefers stable (storageBucket, storagePath)
   * and resolves through resolveMediaUrl at render time.
   */
  objectUrl: string;
  file?: File;
  thumbUrl?: string;
  filename?: string;
  mime?: string;
  size?: number;
  /** Stable storage location — preferred by all render code. */
  storageBucket?: 'chat-media' | 'stories' | 'avatars' | 'round-receipts';
  storagePath?: string;
  thumbnailPath?: string;
  // For poll cards (existing behavior)
  poll_id?: string;
  poll_event?: string;
}

export interface User {
  id: string;
  name: string;
}

export interface TypingState {
  isTyping: boolean;
  lastTypedAt: number;
  users?: { id: string; name: string }[];
}
