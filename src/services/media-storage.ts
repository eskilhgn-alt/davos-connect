/**
 * Media Storage Service
 * Uses IndexedDB for storing media blobs (images, videos)
 * Falls back to blob URLs if IndexedDB fails
 */

const DB_NAME = 'davos_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media';

let db: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

// Initialize IndexedDB
function initDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

  return dbInitPromise;
}

// Save media blob to IndexedDB
export async function saveMedia(id: string, blob: Blob): Promise<string> {
  try {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put({ id, blob, type: blob.type, createdAt: Date.now() });
      
      request.onsuccess = () => {
        // Return a custom URL scheme that we'll handle
        resolve(`indexed-db://${id}`);
      };
      
      request.onerror = () => {
        console.error('Failed to save media:', request.error);
        // Fallback to blob URL
        resolve(URL.createObjectURL(blob));
      };
    });
  } catch (error) {
    console.error('IndexedDB not available, using blob URL:', error);
    return URL.createObjectURL(blob);
  }
}

// Get media blob from IndexedDB
export async function getMedia(id: string): Promise<Blob | null> {
  try {
    const database = await initDB();
    
    return new Promise((resolve) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get(id);
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.blob);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error('Failed to get media:', request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('Failed to access IndexedDB:', error);
    return null;
  }
}

// Delete media from IndexedDB
export async function deleteMedia(id: string): Promise<boolean> {
  try {
    const database = await initDB();
    
    return new Promise((resolve) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.error('Failed to delete media:', request.error);
        resolve(false);
      };
    });
  } catch (error) {
    console.error('Failed to access IndexedDB:', error);
    return false;
  }
}

// Get URL for media (handles both indexed-db:// and regular URLs)
export async function getMediaUrl(url: string): Promise<string | null> {
  if (url.startsWith('indexed-db://')) {
    const id = url.replace('indexed-db://', '');
    const blob = await getMedia(id);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }
  return url;
}

// Check if IndexedDB is available
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export const mediaStorage = {
  saveMedia,
  getMedia,
  deleteMedia,
  getMediaUrl,
  isIndexedDBAvailable,
};
