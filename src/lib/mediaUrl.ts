/**
 * Signed URL resolver for private storage buckets.
 *
 * - Strict bucket whitelist: unknown buckets return null / passthrough and
 *   never call the storage signer.
 * - Accepts (bucket, path) OR a legacy public/signed URL. Nested percent
 *   sequences are decoded exactly once; query/hash are stripped safely.
 * - Public buckets (`avatars`) resolve to their public URL. Private buckets
 *   are signed for ~1h and cached in memory. Refreshes proactively at
 *   REFRESH_THRESHOLD × TTL. Concurrent callers for the same key share the
 *   inflight promise. Batch sign isolates per-file failures.
 * - Never returns a signed URL as stable metadata; never exposes service keys.
 * - Test injection: `__setSigner`/`__setPublicResolver`/`__resetMediaCache`.
 *   Real Supabase is only touched through the injected adapters.
 */

import { supabase } from '@/integrations/supabase/client';

export type Bucket = 'chat-media' | 'stories' | 'avatars' | 'round-receipts';

export const KNOWN_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>([
  'chat-media',
  'stories',
  'avatars',
  'round-receipts',
]);
export const PRIVATE_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>([
  'chat-media',
  'stories',
  'round-receipts',
]);
export const PUBLIC_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>(['avatars']);

/** Type guard against the exact known bucket whitelist. */
export function isKnownBucket(v: unknown): v is Bucket {
  return typeof v === 'string' && KNOWN_BUCKETS.has(v as Bucket);
}

const DEFAULT_TTL_SEC = 60 * 60; // 1h
const REFRESH_THRESHOLD = 0.9;    // refresh when 90% of TTL elapsed

export interface CacheEntry {
  url: string;
  signedAt: number; // epoch ms
  ttlMs: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

function keyFor(bucket: Bucket, path: string): string {
  return `${bucket}::${path}`;
}

// ---------- Signer / public-URL injection ----------
export type SignerFn = (bucket: Bucket, paths: string[], ttlSec: number) =>
  Promise<Array<{ path: string; url: string | null; error?: string | null }>>;
export type PublicResolverFn = (bucket: Bucket, path: string) => string;

const defaultSigner: SignerFn = async (bucket, paths, ttlSec) => {
  // Uses createSignedUrls for batches ≥2 for efficiency; falls back to
  // per-item signing when the batch call returns a top-level error.
  if (paths.length === 1) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(paths[0], ttlSec);
    return [{ path: paths[0], url: data?.signedUrl ?? null, error: error?.message ?? null }];
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, ttlSec);
  if (error) {
    // Fall back to individual signs so a single bad path doesn't kill the batch.
    return Promise.all(paths.map(async (p) => {
      try {
        const { data: d, error: e } = await supabase.storage.from(bucket).createSignedUrl(p, ttlSec);
        return { path: p, url: d?.signedUrl ?? null, error: e?.message ?? null };
      } catch (e) {
        return { path: p, url: null, error: (e as Error)?.message ?? 'sign failed' };
      }
    }));
  }
  return (data || []).map((row) => ({
    path: row.path ?? '',
    url: row.signedUrl ?? null,
    error: row.error ?? null,
  }));
};

const defaultPublicResolver: PublicResolverFn = (bucket, path) =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

let signer: SignerFn = defaultSigner;
let publicResolver: PublicResolverFn = defaultPublicResolver;

/** Test-only: inject a signer. Pass null to restore the default. */
export function __setSigner(fn: SignerFn | null): void {
  signer = fn ?? defaultSigner;
}
/** Test-only: inject a public URL resolver. */
export function __setPublicResolver(fn: PublicResolverFn | null): void {
  publicResolver = fn ?? defaultPublicResolver;
}
/** Test-only: clear cache and inflight state. */
export function __resetMediaCache(): void {
  cache.clear();
  inflight.clear();
}
/** Test-only: read a cache entry (undefined if absent). */
export function __getCacheEntry(bucket: Bucket, path: string): CacheEntry | undefined {
  return cache.get(keyFor(bucket, path));
}

// ---------- URL parsing ----------
/**
 * Parse a Supabase public or signed storage URL. Returns null when input is
 * not a known-bucket storage URL. Decodes each segment exactly once and
 * strips both query and hash.
 */
export function parsePublicStorageUrl(url: string): { bucket: Bucket; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  // Handle both /storage/v1/object/public/... and /storage/v1/object/sign/...
  // Stop path capture at ? or #.
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/);
  if (!m) return null;
  let bucketRaw: string;
  let path: string;
  try {
    bucketRaw = decodeURIComponent(m[1]);
    path = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (!bucketRaw || !path) return null;
  if (!isKnownBucket(bucketRaw)) return null;
  return { bucket: bucketRaw, path };
}

// ---------- Cache ----------
export function isExpired(entry: CacheEntry, now = Date.now()): boolean {
  return now - entry.signedAt >= entry.ttlMs * REFRESH_THRESHOLD;
}

/** Return ms until refresh is due for a cache entry (may be <=0 if due now). */
export function msUntilRefresh(entry: CacheEntry, now = Date.now()): number {
  return Math.max(0, entry.signedAt + entry.ttlMs * REFRESH_THRESHOLD - now);
}

// ---------- Core sign ----------
async function ensureSigned(bucket: Bucket, path: string, ttlSec: number): Promise<string> {
  const k = keyFor(bucket, path);
  const cached = cache.get(k);
  if (cached && !isExpired(cached)) return cached.url;

  const existing = inflight.get(k);
  if (existing) return existing;

  const p = (async () => {
    const rows = await signer(bucket, [path], ttlSec);
    const row = rows.find((r) => r.path === path) ?? rows[0];
    if (!row || !row.url) throw new Error(row?.error || 'sign failed');
    cache.set(k, { url: row.url, signedAt: Date.now(), ttlMs: ttlSec * 1000 });
    return row.url;
  })().finally(() => {
    inflight.delete(k);
  });
  inflight.set(k, p);
  return p;
}

/**
 * Get a display URL for (bucket, path). For public buckets returns the
 * public URL; for private buckets returns a signed URL. Throws on failure.
 */
export async function getMediaUrl(
  bucket: Bucket,
  path: string,
  opts: { ttlSec?: number } = {},
): Promise<string> {
  if (!isKnownBucket(bucket)) throw new Error(`Unknown bucket: ${String(bucket)}`);
  if (!path) throw new Error('Empty storage path');
  if (PUBLIC_BUCKETS.has(bucket)) return publicResolver(bucket, path);
  const ttlSec = opts.ttlSec ?? DEFAULT_TTL_SEC;
  return ensureSigned(bucket, path, ttlSec);
}

/**
 * Invalidate the cached URL for (bucket, path). Next call will re-sign.
 */
export function invalidateMediaUrl(bucket: Bucket, path: string): void {
  cache.delete(keyFor(bucket, path));
}

/**
 * Resolve a display URL from either explicit (bucket, path) OR a stored URL
 * that may be legacy public/signed. External non-storage URLs pass through
 * unchanged. Returns '' for empty input, and passthroughs the URL for
 * anything that isn't a known-bucket storage URL.
 */
export async function resolveMediaUrl(input: {
  bucket?: Bucket | null | string;
  path?: string | null;
  url?: string | null;
  ttlSec?: number;
}): Promise<string> {
  if (input.bucket && input.path && isKnownBucket(input.bucket)) {
    return getMediaUrl(input.bucket, input.path, { ttlSec: input.ttlSec });
  }
  if (input.url) {
    const parsed = parsePublicStorageUrl(input.url);
    if (parsed) return getMediaUrl(parsed.bucket, parsed.path, { ttlSec: input.ttlSec });
    return input.url; // external passthrough (Giphy, blob:, etc.)
  }
  return '';
}

/**
 * Batch-sign many paths within the same bucket. Returns map: path → signed URL.
 * Cache hits are returned directly; only missing paths are sent to the signer.
 * Per-file failures are isolated — a bad path never poisons the batch.
 */
export async function signBatch(
  bucket: Bucket,
  paths: string[],
  ttlSec = DEFAULT_TTL_SEC,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isKnownBucket(bucket)) return out;
  const uniq = Array.from(new Set(paths.filter(Boolean)));
  const missing: string[] = [];
  for (const p of uniq) {
    const cached = cache.get(keyFor(bucket, p));
    if (cached && !isExpired(cached)) out.set(p, cached.url);
    else missing.push(p);
  }
  if (PUBLIC_BUCKETS.has(bucket)) {
    for (const p of missing) out.set(p, publicResolver(bucket, p));
    return out;
  }
  if (missing.length === 0) return out;
  const rows = await signer(bucket, missing, ttlSec);
  for (const row of rows) {
    if (!row.url || row.error) {
      if (row.error) console.warn('[mediaUrl] sign failed for', bucket, row.path, row.error);
      continue;
    }
    cache.set(keyFor(bucket, row.path), { url: row.url, signedAt: Date.now(), ttlMs: ttlSec * 1000 });
    out.set(row.path, row.url);
  }
  return out;
}

export const __TEST__ = {
  DEFAULT_TTL_SEC,
  REFRESH_THRESHOLD,
};
