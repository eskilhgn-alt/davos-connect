/**
 * Deterministic tests for the signed private-media resolver.
 * No real Supabase network I/O — the signer/public-url resolver are injected.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parsePublicStorageUrl,
  isKnownBucket,
  getMediaUrl,
  resolveMediaUrl,
  signBatch,
  invalidateMediaUrl,
  isExpired,
  msUntilRefresh,
  __setSigner,
  __setPublicResolver,
  __resetMediaCache,
  __getCacheEntry,
  __TEST__,
  type SignerFn,
  type Bucket,
} from '@/lib/mediaUrl';

function makeSigner(overrides: Partial<Record<string, string | null>> = {}, opts: { latencyMs?: number; onCall?: (bucket: Bucket, paths: string[]) => void } = {}): { fn: SignerFn; calls: Array<{ bucket: Bucket; paths: string[] }>; } {
  const calls: Array<{ bucket: Bucket; paths: string[] }> = [];
  let stamp = 0;
  const fn: SignerFn = async (bucket, paths, _ttl) => {
    calls.push({ bucket, paths: [...paths] });
    opts.onCall?.(bucket, paths);
    if (opts.latencyMs) {
      await new Promise((r) => setTimeout(r, opts.latencyMs));
    }
    return paths.map((p) => {
      if (overrides[p] === null) return { path: p, url: null, error: 'nope' };
      const s = ++stamp;
      const url = overrides[p] ?? `https://signed.test/${bucket}/${encodeURI(p)}?s=${s}`;
      return { path: p, url };
    });
  };
  return { fn, calls };
}

beforeEach(() => {
  __resetMediaCache();
  __setSigner(null);
  __setPublicResolver((bucket, path) => `https://public.test/${bucket}/${path}`);
});

describe('parsePublicStorageUrl — known/unknown buckets', () => {
  it('parses a public URL for a known bucket', () => {
    const out = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/public/chat-media/user1/photo.jpg',
    );
    expect(out).toEqual({ bucket: 'chat-media', path: 'user1/photo.jpg' });
  });

  it('parses a signed URL and strips its query token', () => {
    const out = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/sign/stories/u/2.mp4?token=abc.def.ghi',
    );
    expect(out).toEqual({ bucket: 'stories', path: 'u/2.mp4' });
  });

  it('strips hash fragments', () => {
    const out = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/public/round-receipts/a/b.pdf#page=2',
    );
    expect(out).toEqual({ bucket: 'round-receipts', path: 'a/b.pdf' });
  });

  it('rejects unknown buckets', () => {
    expect(
      parsePublicStorageUrl('https://x.supabase.co/storage/v1/object/public/evil-bucket/hack.jpg'),
    ).toBeNull();
  });

  it('rejects non-storage URLs', () => {
    expect(parsePublicStorageUrl('https://media.giphy.com/media/xyz/giphy.gif')).toBeNull();
    expect(parsePublicStorageUrl('blob:http://localhost/uuid')).toBeNull();
    expect(parsePublicStorageUrl('')).toBeNull();
  });

  it('decodes percent-encoded spaces and unicode exactly once (no double-decode)', () => {
    const out = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/public/chat-media/user/hello%20world%20%C3%A5%C3%B8.jpg',
    );
    expect(out).toEqual({ bucket: 'chat-media', path: 'user/hello world åø.jpg' });
    // Double-decoding would corrupt any residual %25 into %; guard against it.
    const out2 = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/public/chat-media/user/one%2520two.jpg',
    );
    // First decode yields "one%20two.jpg" — a valid literal path, not " ".
    expect(out2).toEqual({ bucket: 'chat-media', path: 'user/one%20two.jpg' });
  });

  it('preserves nested subdirectory characters', () => {
    const out = parsePublicStorageUrl(
      'https://x.supabase.co/storage/v1/object/public/chat-media/a/b/c/d/e.jpg?x=1',
    );
    expect(out).toEqual({ bucket: 'chat-media', path: 'a/b/c/d/e.jpg' });
  });
});

describe('isKnownBucket', () => {
  it('accepts exact known values only', () => {
    expect(isKnownBucket('chat-media')).toBe(true);
    expect(isKnownBucket('stories')).toBe(true);
    expect(isKnownBucket('avatars')).toBe(true);
    expect(isKnownBucket('round-receipts')).toBe(true);
    expect(isKnownBucket('chat_media')).toBe(false);
    expect(isKnownBucket('')).toBe(false);
    expect(isKnownBucket(null)).toBe(false);
    expect(isKnownBucket(undefined)).toBe(false);
  });
});

describe('getMediaUrl / resolveMediaUrl', () => {
  it('rejects unknown bucket without calling signer', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    await expect(getMediaUrl('nope' as unknown as Bucket, 'x/y.jpg')).rejects.toThrow(/Unknown bucket/);
    expect(calls).toHaveLength(0);
  });

  it('avatars go through public resolver (no signing)', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    const url = await getMediaUrl('avatars', 'u/1.jpg');
    expect(url).toBe('https://public.test/avatars/u/1.jpg');
    expect(calls).toHaveLength(0);
  });

  it('external URL passthrough (Giphy, blob)', async () => {
    expect(await resolveMediaUrl({ url: 'https://media.giphy.com/x.gif' })).toBe('https://media.giphy.com/x.gif');
    expect(await resolveMediaUrl({ url: 'blob:http://localhost/uuid' })).toBe('blob:http://localhost/uuid');
    expect(await resolveMediaUrl({})).toBe('');
  });

  it('cache hit avoids second signer call', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    const a = await getMediaUrl('chat-media', 'u/1.jpg');
    const b = await getMediaUrl('chat-media', 'u/1.jpg');
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
  });

  it('dedupes concurrent inflight calls for the same key', async () => {
    const { fn, calls } = makeSigner({}, { latencyMs: 30 });
    __setSigner(fn);
    const [a, b, c] = await Promise.all([
      getMediaUrl('chat-media', 'u/2.jpg'),
      getMediaUrl('chat-media', 'u/2.jpg'),
      getMediaUrl('chat-media', 'u/2.jpg'),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(calls).toHaveLength(1);
    expect(calls[0].paths).toEqual(['u/2.jpg']);
  });

  it('signBatch batches missing paths and reuses cache hits', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    // Prime one entry.
    await getMediaUrl('chat-media', 'u/pre.jpg');
    calls.length = 0;

    const out = await signBatch('chat-media', ['u/pre.jpg', 'u/a.jpg', 'u/b.jpg']);
    expect(out.get('u/pre.jpg')).toBeTruthy();
    expect(out.get('u/a.jpg')).toBeTruthy();
    expect(out.get('u/b.jpg')).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].paths.sort()).toEqual(['u/a.jpg', 'u/b.jpg']);
  });

  it('signBatch isolates per-path failures', async () => {
    const { fn } = makeSigner({ 'u/bad.jpg': null });
    __setSigner(fn);
    const out = await signBatch('chat-media', ['u/good.jpg', 'u/bad.jpg']);
    expect(out.has('u/good.jpg')).toBe(true);
    expect(out.has('u/bad.jpg')).toBe(false);
  });

  it('signBatch returns empty map for unknown bucket without calling signer', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    const out = await signBatch('nope' as unknown as Bucket, ['a.jpg']);
    expect(out.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('invalidateMediaUrl forces a re-sign', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    const a = await getMediaUrl('chat-media', 'u/rot.jpg');
    invalidateMediaUrl('chat-media', 'u/rot.jpg');
    const b = await getMediaUrl('chat-media', 'u/rot.jpg');
    expect(a).not.toBe(b); // different signer stamps
    expect(calls).toHaveLength(2);
  });
});

describe('cache expiry / refresh scheduler', () => {
  it('isExpired flips at REFRESH_THRESHOLD of TTL', () => {
    const now = 1_000_000_000_000;
    const ttlMs = 60_000;
    const entry = { url: 'u', signedAt: now, ttlMs };
    expect(isExpired(entry, now)).toBe(false);
    expect(isExpired(entry, now + ttlMs * __TEST__.REFRESH_THRESHOLD - 1)).toBe(false);
    expect(isExpired(entry, now + ttlMs * __TEST__.REFRESH_THRESHOLD)).toBe(true);
  });

  it('msUntilRefresh clamps to zero when already due', () => {
    const now = 1_000_000_000_000;
    const ttlMs = 60_000;
    expect(msUntilRefresh({ url: 'u', signedAt: now, ttlMs }, now)).toBeGreaterThan(0);
    expect(msUntilRefresh({ url: 'u', signedAt: now - ttlMs, ttlMs }, now)).toBe(0);
  });

  it('stale cache entry triggers a re-sign on next getMediaUrl', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    await getMediaUrl('chat-media', 'u/x.jpg');
    // Age the entry so it counts as expired.
    const entry = __getCacheEntry('chat-media', 'u/x.jpg')!;
    entry.signedAt = Date.now() - entry.ttlMs; // fully past TTL
    await getMediaUrl('chat-media', 'u/x.jpg');
    expect(calls).toHaveLength(2);
  });
});

describe('never persists a signed URL as stable metadata', () => {
  it('signer output URLs never leak into the exported cache shape used for persistence', async () => {
    const { fn } = makeSigner();
    __setSigner(fn);
    const u = await getMediaUrl('chat-media', 'u/persist.jpg');
    expect(u).toMatch(/^https:\/\/signed\.test\//);
    // The cache is an internal runtime concern; persistence goes through
    // serializeAttachmentForPersist. Verify the module never exposes a helper
    // that returns the signed URL alongside stable-path fields.
    const mod = await import('@/lib/mediaUrl');
    for (const key of Object.keys(mod)) {
      if (key.startsWith('__')) continue;
      // No exported function is named to imply "persist" — sanity check.
      expect(/persist|toRow|toJson/i.test(key)).toBe(false);
    }
  });
});

// ---------- React hook + component tests (minimal harness, no @testing-library) ----------
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSignedMedia, SignedImg } from '@/components/ui/SignedMedia';

function mount(el: React.ReactElement): { container: HTMLDivElement; root: Root; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(el); });
  return {
    container,
    root,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('useSignedMedia — status, retry, refresh scheduler cleanup', () => {
  it('transitions loading → ready with url', async () => {
    const { fn } = makeSigner();
    __setSigner(fn);
    const seen: string[] = [];
    const Probe: React.FC = () => {
      const s = useSignedMedia('chat-media', 'u/z.jpg', null);
      seen.push(s.status);
      return React.createElement('span', { 'data-testid': 'url' }, s.url || '');
    };
    const h = mount(React.createElement(Probe));
    await flush();
    expect(h.container.querySelector('[data-testid="url"]')!.textContent).toMatch(/signed\.test/);
    expect(seen).toContain('loading');
    expect(seen[seen.length - 1]).toBe('ready');
    h.unmount();
  });

  it('surfaces error status when signer rejects', async () => {
    const failing: SignerFn = async (_b, paths) => paths.map((p) => ({ path: p, url: null, error: 'boom' }));
    __setSigner(failing);
    const Probe: React.FC = () => {
      const { status, error } = useSignedMedia('chat-media', 'u/err.jpg', null);
      return React.createElement('span', { 'data-testid': 's' }, `${status}:${error || ''}`);
    };
    const h = mount(React.createElement(Probe));
    await flush();
    expect(h.container.querySelector('[data-testid="s"]')!.textContent).toBe('error:boom');
    h.unmount();
  });

  it('retry() re-signs after invalidation', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    let retryFn: () => void = () => {};
    const Probe: React.FC = () => {
      const s = useSignedMedia('chat-media', 'u/r.jpg', null);
      retryFn = s.retry;
      return React.createElement('span', { 'data-testid': 'u' }, s.url || '');
    };
    const h = mount(React.createElement(Probe));
    await flush();
    const before = h.container.querySelector('[data-testid="u"]')!.textContent!;
    expect(before).toMatch(/signed\.test/);
    await act(async () => { retryFn(); });
    await flush();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(h.container.querySelector('[data-testid="u"]')!.textContent).not.toBe(before);
    h.unmount();
  });

  it('cleans up refresh timer on unmount', async () => {
    vi.useFakeTimers();
    try {
      const { fn, calls } = makeSigner();
      __setSigner(fn);
      const Probe: React.FC = () => {
        const s = useSignedMedia('chat-media', 'u/t.jpg', null);
        return React.createElement('span', null, s.url || '');
      };
      const h = mount(React.createElement(Probe));
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      const beforeCount = calls.length;
      h.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(calls.length).toBe(beforeCount);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SignedImg — accessible loading + retry state', () => {
  it('renders an accessible skeleton with aria-busy while resolving', async () => {
    const slow: SignerFn = (bucket, paths) => new Promise((resolve) => {
      setTimeout(() => resolve(paths.map((p) => ({ path: p, url: `https://signed.test/${bucket}/${p}` }))), 40);
    });
    __setSigner(slow);
    const h = mount(React.createElement(SignedImg, { bucket: 'chat-media', path: 'u/skel.jpg', alt: 'skel' }));
    const skel = h.container.querySelector('[aria-busy="true"]');
    expect(skel).not.toBeNull();
    h.unmount();
  });

  it('shows an accessible error UI with a retry button after two image errors', async () => {
    const { fn } = makeSigner();
    __setSigner(fn);
    const h = mount(React.createElement(SignedImg, { bucket: 'chat-media', path: 'u/broken.jpg', alt: 'test' }));
    await flush();
    // Two consecutive <img> onError events.
    for (let i = 0; i < 2; i++) {
      const img = h.container.querySelector('img');
      if (img) {
        await act(async () => { img.dispatchEvent(new Event('error')); });
        await flush();
      }
    }
    expect(h.container.querySelector('[role="alert"]')).not.toBeNull();
    const btn = Array.from(h.container.querySelectorAll('button')).find((b) => /prøv igjen/i.test(b.textContent || ''));
    expect(btn).toBeTruthy();
    h.unmount();
  });
});

// ---------- Slice 2 QA regression tests ----------

import { MediaAttachment } from '@/chat/MessageItem';
import type { Attachment } from '@/chat/types';

describe('useSignedMedia — legacy public/signed URL refresh scheduling', () => {
  it('schedules an auto-refresh for legacy private-bucket URL and cleans up on unmount', async () => {
    vi.useFakeTimers();
    try {
      const { fn, calls } = makeSigner();
      __setSigner(fn);
      const legacyUrl =
        'https://x.supabase.co/storage/v1/object/public/round-receipts/user/legacy.jpg';
      const Probe: React.FC = () => {
        const s = useSignedMedia(null, null, legacyUrl);
        return React.createElement('span', { 'data-testid': 'u' }, s.url || '');
      };
      const h = mount(React.createElement(Probe));
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      expect(h.container.querySelector('[data-testid="u"]')!.textContent).toMatch(/signed\.test/);
      const initialCalls = calls.length;
      expect(initialCalls).toBeGreaterThanOrEqual(1);

      // Advance past 0.9 × TTL − REFRESH_LEAD_MS. TTL is DEFAULT_TTL_SEC = 3600s.
      // The refresh should re-sign the same path exactly once.
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(calls.length).toBeGreaterThan(initialCalls);
      const afterRefreshCalls = calls.length;

      // Unmount then advance well past another TTL — no further signer calls.
      h.unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(calls.length).toBe(afterRefreshCalls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT schedule refresh for external Giphy/blob URLs', async () => {
    vi.useFakeTimers();
    try {
      const { fn, calls } = makeSigner();
      __setSigner(fn);
      const Probe: React.FC<{ u: string }> = ({ u }) => {
        const s = useSignedMedia(null, null, u);
        return React.createElement('span', null, s.url || '');
      };
      const h1 = mount(React.createElement(Probe, { u: 'https://media.giphy.com/x.gif' }));
      const h2 = mount(React.createElement(Probe, { u: 'blob:http://localhost/uuid' }));
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(calls.length).toBe(0);
      h1.unmount();
      h2.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT schedule refresh for the public avatars bucket', async () => {
    vi.useFakeTimers();
    try {
      const { fn, calls } = makeSigner();
      __setSigner(fn);
      const Probe: React.FC = () => {
        const s = useSignedMedia('avatars', 'u/1.jpg', null);
        return React.createElement('span', null, s.url || '');
      };
      const h = mount(React.createElement(Probe));
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000); });
      expect(calls.length).toBe(0); // publicResolver only, no signer
      h.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('signBatch — inflight overlap dedupe', () => {
  it('reuses ensureSigned inflight promise instead of duplicating signer calls', async () => {
    const { fn, calls } = makeSigner({}, { latencyMs: 40 });
    __setSigner(fn);
    // Kick off ensureSigned (via getMediaUrl) but do NOT await it — the
    // inflight entry must be present when signBatch runs.
    const p1 = getMediaUrl('chat-media', 'u/overlap.jpg');
    const p2 = signBatch('chat-media', ['u/overlap.jpg', 'u/other.jpg']);
    const [urlA, mapB] = await Promise.all([p1, p2]);
    expect(mapB.get('u/overlap.jpg')).toBe(urlA);
    expect(mapB.get('u/other.jpg')).toMatch(/signed\.test/);
    // Exactly TWO signer invocations: one from ensureSigned (paths=[overlap])
    // and one batch from signBatch for the new path (paths=[other]).
    // The overlap path is NOT re-requested.
    expect(calls).toHaveLength(2);
    const flat = calls.flatMap((c) => c.paths);
    expect(flat.filter((p) => p === 'u/overlap.jpg')).toHaveLength(1);
    expect(flat).toContain('u/other.jpg');
  });

  it('two overlapping signBatch calls share the same signer batch per path', async () => {
    const { fn, calls } = makeSigner({}, { latencyMs: 40 });
    __setSigner(fn);
    const [a, b] = await Promise.all([
      signBatch('chat-media', ['u/x.jpg', 'u/y.jpg']),
      signBatch('chat-media', ['u/y.jpg', 'u/z.jpg']),
    ]);
    expect(a.get('u/y.jpg')).toBe(b.get('u/y.jpg'));
    // Signer sees each path at most once across both calls.
    const flat = calls.flatMap((c) => c.paths);
    expect(flat.sort()).toEqual(['u/x.jpg', 'u/y.jpg', 'u/z.jpg'].sort());
  });
});

// ---------- MediaAttachment regression tests ----------

function makeAtt(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: overrides.id ?? 'att-1',
    kind: overrides.kind ?? 'image',
    storageBucket: overrides.storageBucket ?? 'chat-media',
    storagePath: overrides.storagePath ?? 'u/full.jpg',
    thumbnailPath: overrides.thumbnailPath,
    filename: overrides.filename,
    mime: overrides.mime,
    size: overrides.size,
    objectUrl: overrides.objectUrl,
    thumbUrl: overrides.thumbUrl,
  } as Attachment;
}

describe('MediaAttachment — retry gate and thumbnail fallback', () => {
  it('surfaces role=alert after two full-media load errors with finite signer calls', async () => {
    const { fn, calls } = makeSigner();
    __setSigner(fn);
    const att = makeAtt({ storagePath: 'u/full-only.jpg' }); // no thumb
    const h = mount(React.createElement(MediaAttachment, { att, onTap: () => {} }));
    await flush();

    // Two consecutive <img> onError events on the SAME attachment.
    for (let i = 0; i < 2; i++) {
      const img = h.container.querySelector('img');
      expect(img).not.toBeNull();
      await act(async () => { img!.dispatchEvent(new Event('error')); });
      await flush();
    }
    expect(h.container.querySelector('[role="alert"]')).not.toBeNull();
    // Retry gate is one-shot: initial sign + one retry = 2 signer calls max
    // for the full path; never an infinite loop.
    const fullCalls = calls.flatMap((c) => c.paths).filter((p) => p === 'u/full-only.jpg').length;
    expect(fullCalls).toBeLessThanOrEqual(2);
    h.unmount();
  });

  it('falls back to full image when the thumbnail keeps failing (no terminal error)', async () => {
    // Signer succeeds for both; only the thumb IMG will keep firing onError.
    const { fn } = makeSigner();
    __setSigner(fn);
    const att = makeAtt({
      storagePath: 'u/full-ok.jpg',
      thumbnailPath: 'u/thumb-broken.jpg',
    });
    const tapped: string[] = [];
    const h = mount(React.createElement(MediaAttachment, { att, onTap: (u: string) => tapped.push(u) }));
    await flush();

    // The thumb src is preferred first. Fire two errors — thumb retry gate
    // exhausts, then MediaAttachment falls back to the full URL.
    for (let i = 0; i < 2; i++) {
      const img = h.container.querySelector('img');
      if (img) {
        await act(async () => { img.dispatchEvent(new Event('error')); });
        await flush();
      }
    }

    // No terminal error — attachment still renders and is activatable.
    expect(h.container.querySelector('[role="alert"]')).toBeNull();
    const btn = h.container.querySelector('[role="button"]') as HTMLElement | null;
    expect(btn).not.toBeNull();
    // The currently rendered <img> now points at the FULL signed URL.
    const img = h.container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/u%2Ffull-ok\.jpg|u\/full-ok\.jpg/);

    // Activating via keyboard invokes onTap with the full URL.
    await act(async () => {
      btn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(tapped.length).toBeGreaterThanOrEqual(1);
    expect(tapped[0]).toMatch(/u%2Ffull-ok\.jpg|u\/full-ok\.jpg/);
    h.unmount();
  });

  it('thumbnail signing error alone does not block the full media', async () => {
    // Signer returns null for the thumb, success for the full.
    const { fn } = makeSigner({ 'u/thumb-nope.jpg': null });
    __setSigner(fn);
    const att = makeAtt({
      storagePath: 'u/full-ok2.jpg',
      thumbnailPath: 'u/thumb-nope.jpg',
    });
    const h = mount(React.createElement(MediaAttachment, { att, onTap: () => {} }));
    await flush();
    expect(h.container.querySelector('[role="alert"]')).toBeNull();
    const img = h.container.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/full-ok2/);
    h.unmount();
  });
});


