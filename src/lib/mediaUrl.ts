/**
 * Signed URL resolver for private storage buckets.
 *
 * - Accepts (bucket, path) OR a legacy public URL of the form
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path...>
 * - Batches sign requests per bucket and caches results in-memory with an
 *   expiry-aware TTL (default ~1h). Automatically refreshes when a URL is
 *   requested past ~90% of its lifetime.
 * - Never stores service keys. Uses the anon Supabase JS client.
 * - Avatars are treated as public (they live in a public bucket).
 */

import { supabase } from '@/integrations/supabase/client';

export type Bucket = 'chat-media' | 'stories' | 'avatars' | 'round-receipts';
export const PRIVATE_BUCKETS: ReadonlySet<Bucket> = new Set(['chat-media', 'stories', 'round-receipts']);
export const PUBLIC_BUCKETS: ReadonlySet<Bucket> = new Set(['avatars']);

const DEFAULT_TTL_SEC = 60 * 60; // 1h
const REFRESH_THRESHOLD = 0.9; // refresh when 90% of TTL elapsed

interface CacheEntry {
  url: string;
  signedAt: number; // epoch ms
  ttlMs: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

function keyFor(bucket: Bucket, path: string): string {
  return `${bucket}::${path}`;
}

/**
 * Parse a Supabase public storage URL. Returns null when input isn't a public
 * storage URL for one of our known buckets.
 * Exported for testing.
 */
export function parsePublicStorageUrl(url: string): { bucket: Bucket; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  // Matches /storage/v1/object/public/<bucket>/<path>
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]) as Bucket;
  const path = decodeURIComponent(m[2]);
  if (!bucket || !path) return null;
  return { bucket, path };
}

function isExpired(entry: CacheEntry, now = Date.now()): boolean {
  return now - entry.signedAt >= entry.ttlMs * REFRESH_THRESHOLD;
}

async function signOne(bucket: Bucket, path: string, ttlSec: number): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data?.signedUrl) throw error ?? new Error('sign failed');
  return data.signedUrl;
}

/**
 * Get a signed URL for a private bucket file. For public buckets returns the
 * public URL. Refreshes automatically when the cached URL is stale.
 */
export async function getMediaUrl(
  bucket: Bucket,
  path: string,
  opts: { ttlSec?: number } = {},
): Promise<string> {
  if (PUBLIC_BUCKETS.has(bucket)) {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
  const k = keyFor(bucket, path);
  const cached = cache.get(k);
  if (cached && !isExpired(cached)) return cached.url;

  const existing = inflight.get(k);
  if (existing) return existing;

  const p = signOne(bucket, path, ttlSec).then((url) => {
    cache.set(k, { url, signedAt: Date.now(), ttlMs: ttlSec * 1000 });
    inflight.delete(k);
    return url;
  }).catch((e) => {
    inflight.delete(k);
    throw e;
  });
  inflight.set(k, p);
  return p;
}

/**
 * Resolve a display URL from either explicit (bucket, path) OR a stored URL
 * that may be legacy public. Returns the original URL when we can't parse it.
 */
export async function resolveMediaUrl(input: {
  bucket?: Bucket | null;
  path?: string | null;
  url?: string | null;
  ttlSec?: number;
}): Promise<string> {
  if (input.bucket && input.path) {
    return getMediaUrl(input.bucket, input.path, { ttlSec: input.ttlSec });
  }
  if (input.url) {
    const parsed = parsePublicStorageUrl(input.url);
    if (parsed) return getMediaUrl(parsed.bucket, parsed.path, { ttlSec: input.ttlSec });
    return input.url;
  }
  return '';
}

/**
 * Batch-sign many paths within the same bucket. Returns map: path → signed URL.
 */
export async function signBatch(bucket: Bucket, paths: string[], ttlSec = DEFAULT_TTL_SEC): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const p of paths) {
    const cached = cache.get(keyFor(bucket, p));
    if (cached && !isExpired(cached)) out.set(p, cached.url);
    else missing.push(p);
  }
  if (PUBLIC_BUCKETS.has(bucket)) {
    for (const p of missing) {
      out.set(p, supabase.storage.from(bucket).getPublicUrl(p).data.publicUrl);
    }
    return out;
  }
  if (missing.length === 0) return out;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, ttlSec);
  if (error) {
    // Fall back to per-item signing so a single bad path doesn't kill the batch.
    await Promise.all(missing.map(async (p) => {
      try {
        const url = await signOne(bucket, p, ttlSec);
        cache.set(keyFor(bucket, p), { url, signedAt: Date.now(), ttlMs: ttlSec * 1000 });
        out.set(p, url);
      } catch (e) {
        console.warn('[mediaUrl] sign failed for', bucket, p, e);
      }
    }));
    return out;
  }
  for (const row of data || []) {
    if (row.error || !row.signedUrl || !row.path) continue;
    cache.set(keyFor(bucket, row.path), { url: row.signedUrl, signedAt: Date.now(), ttlMs: ttlSec * 1000 });
    out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Test-only: clear cache. */
export function __resetMediaCache(): void {
  cache.clear();
  inflight.clear();
}
