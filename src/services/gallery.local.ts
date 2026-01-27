/**
 * Gallery Service - Media Index
 * Maintains a local index of all media shared in chat
 * Avoids scanning chat log on every render
 */

import type { LocalMessage, MessageAttachment } from './contracts';

const STORAGE_KEY = 'liftlager:gallery:index';

export interface GalleryItem {
  id: string;
  messageId: string;
  createdAt: number;
  type: 'image' | 'gif' | 'video';
  url: string;
  thumbUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

interface GalleryIndex {
  items: GalleryItem[];
  updatedAt: number;
}

// Get stored index
function getIndex(): GalleryIndex {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { items: [], updatedAt: Date.now() };
}

// Save index
function saveIndex(index: GalleryIndex): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('Failed to save gallery index:', error);
  }
}

// Get all gallery items (sorted by newest first)
export function getGalleryItems(): GalleryItem[] {
  const index = getIndex();
  return [...index.items].sort((a, b) => b.createdAt - a.createdAt);
}

// Add items from a message
export function addFromMessage(message: LocalMessage): void {
  if (!message.attachments || message.attachments.length === 0) return;
  
  const index = getIndex();
  
  for (const attachment of message.attachments) {
    // Check if already exists
    if (index.items.some(item => item.id === attachment.id)) {
      continue;
    }
    
    const item: GalleryItem = {
      id: attachment.id,
      messageId: message.id,
      createdAt: message.createdAt,
      type: attachment.type,
      url: attachment.url,
      thumbUrl: attachment.thumbUrl,
    };
    
    index.items.push(item);
  }
  
  index.updatedAt = Date.now();
  saveIndex(index);
}

// Update an item (e.g., add thumbnail after processing)
export function updateItem(id: string, updates: Partial<GalleryItem>): void {
  const index = getIndex();
  const itemIndex = index.items.findIndex(item => item.id === id);
  
  if (itemIndex === -1) return;
  
  index.items[itemIndex] = {
    ...index.items[itemIndex],
    ...updates,
  };
  
  index.updatedAt = Date.now();
  saveIndex(index);
}

// Remove item by ID
export function removeItem(id: string): void {
  const index = getIndex();
  index.items = index.items.filter(item => item.id !== id);
  index.updatedAt = Date.now();
  saveIndex(index);
}

// Get count of items
export function getItemCount(): number {
  return getIndex().items.length;
}

// Clear all items (for debugging)
export function clearAll(): void {
  saveIndex({ items: [], updatedAt: Date.now() });
}

// Export service object
export const galleryService = {
  getGalleryItems,
  addFromMessage,
  updateItem,
  removeItem,
  getItemCount,
  clearAll,
};
