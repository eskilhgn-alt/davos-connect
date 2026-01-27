/**
 * Image Thumbnail Utility
 * Creates JPEG thumbnails for faster chat rendering
 * No external dependencies
 */

export interface ThumbnailResult {
  originalBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
}

const MAX_THUMB_WIDTH = 900;
const THUMB_QUALITY = 0.82;

/**
 * Create a thumbnail from an image file
 * Returns both original and thumbnail blobs
 */
export async function createThumbnail(file: File): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const { width, height } = img;
      
      // Calculate thumbnail dimensions
      let thumbWidth = width;
      let thumbHeight = height;
      
      if (width > MAX_THUMB_WIDTH) {
        const ratio = MAX_THUMB_WIDTH / width;
        thumbWidth = MAX_THUMB_WIDTH;
        thumbHeight = Math.round(height * ratio);
      }
      
      // Create canvas for thumbnail
      const canvas = document.createElement('canvas');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw scaled image
      ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
      
      // Convert to blob
      canvas.toBlob(
        (thumbBlob) => {
          if (!thumbBlob) {
            reject(new Error('Failed to create thumbnail blob'));
            return;
          }
          
          resolve({
            originalBlob: file,
            thumbBlob,
            width,
            height,
          });
        },
        'image/jpeg',
        THUMB_QUALITY
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Create a thumbnail from a video file (first frame)
 */
export async function createVideoThumbnail(file: File): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      // Seek to first frame
      video.currentTime = 0.1;
    };
    
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = video;
      
      // Calculate thumbnail dimensions
      let thumbWidth = width;
      let thumbHeight = height;
      
      if (width > MAX_THUMB_WIDTH) {
        const ratio = MAX_THUMB_WIDTH / width;
        thumbWidth = MAX_THUMB_WIDTH;
        thumbHeight = Math.round(height * ratio);
      }
      
      // Create canvas for thumbnail
      const canvas = document.createElement('canvas');
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Draw video frame
      ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
      URL.revokeObjectURL(url);
      
      // Convert to blob
      canvas.toBlob(
        (thumbBlob) => {
          if (!thumbBlob) {
            reject(new Error('Failed to create video thumbnail blob'));
            return;
          }
          
          resolve({
            originalBlob: file,
            thumbBlob,
            width,
            height,
          });
        },
        'image/jpeg',
        THUMB_QUALITY
      );
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };
    
    video.src = url;
    video.load();
  });
}
