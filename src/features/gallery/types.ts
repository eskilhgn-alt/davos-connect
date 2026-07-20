/**
 * Shared types for the Gallery feature.
 */
import type { Bucket } from "@/lib/mediaUrl";

export interface GalleryRow {
  id: string;
  storage_path: string;
  storage_bucket: Bucket;
  thumbnail_path: string | null;
  caption: string | null;
  type: string;
  created_at: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  source_message_id: string | null;
  source_story_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
}

export interface ProfileLite {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface CommentRow {
  id: string;
  item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  /** Nullable — legacy rows created before Slice 4B may not carry one. */
  client_id: string | null;
}

export interface OptimisticComment {
  clientId: string;
  item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  state: "pending" | "failed";
  error?: string;
}

export type AnyComment =
  | ({ kind: "server" } & CommentRow)
  | ({ kind: "optimistic" } & OptimisticComment);

export interface CursorKey {
  created_at: string;
  id: string;
}

/** Cursor for the paginated comment thread. Newest first internally. */
export interface CommentCursor {
  created_at: string;
  id: string;
}

export type DeleteMode = "direct" | "derived";
