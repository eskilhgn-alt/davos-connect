/**
 * Simple media URL helper for gallery
 * Handles indexed-db:// URLs by storing blobs in memory
 */

// In-memory cache for blob URLs during session
const blobCache = new Map<string, string>();

export async function getMediaUrl(url: string): Promise<string | null> {
  // Regular URLs pass through
  if (!url.startsWith('indexed-db://')) {
    return url;
  }
  
  // Check cache
  const cached = blobCache.get(url);
  if (cached) {
    return cached;
  }
  
  // For indexed-db URLs without actual IndexedDB storage,
  // we can't recover the blob. Return null.
  // New attachments will use regular blob URLs that work during session.
  return null;
}

export const mediaStorage = {
  getMediaUrl,
};
