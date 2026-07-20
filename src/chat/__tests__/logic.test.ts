import { describe, it, expect } from 'vitest';
import {
  compareMessages,
  sortedDeduped,
  isBeforeCursor,
  oldestCursor,
  resolveReactions,
  mediaAttachments,
  fileAttachments,
  mapReplyPreview,
  isDuplicateKeyError,
  attachmentsNeedingUpload,
  attachmentsAlreadyUploaded,
  isSorted,
  sanitizeExtension,
  buildBeforeCursorOrFilter,
} from '@/chat/logic';
import type { Attachment } from '@/chat/types';


describe('chat/logic — pagination cursor & merge/order', () => {
  it('is strictly before by (createdAt, id) tiebreaker', () => {
    const cursor = { createdAt: 100, id: 'm' };
    expect(isBeforeCursor({ createdAt: 99, id: 'z' }, cursor)).toBe(true);
    expect(isBeforeCursor({ createdAt: 100, id: 'a' }, cursor)).toBe(true);
    expect(isBeforeCursor({ createdAt: 100, id: 'm' }, cursor)).toBe(false);
    expect(isBeforeCursor({ createdAt: 100, id: 'z' }, cursor)).toBe(false);
    expect(isBeforeCursor({ createdAt: 101, id: 'a' }, cursor)).toBe(false);
  });

  it('oldestCursor picks the smallest (createdAt,id)', () => {
    const items = [
      { createdAt: 100, id: 'z' },
      { createdAt: 100, id: 'a' },
      { createdAt: 200, id: '0' },
    ];
    expect(oldestCursor(items)).toEqual({ createdAt: 100, id: 'a' });
    expect(oldestCursor([])).toBeNull();
  });

  it('compareMessages produces deterministic ascending order', () => {
    const a = { createdAt: 5, id: 'b' };
    const b = { createdAt: 5, id: 'a' };
    expect(compareMessages(a, b)).toBeGreaterThan(0);
    expect(compareMessages(b, a)).toBeLessThan(0);
    expect(compareMessages(a, a)).toBe(0);
  });

  it('sortedDeduped dedupes by id (last wins) and is sorted', () => {
    const items = [
      { id: '1', createdAt: 10, tag: 'old' },
      { id: '2', createdAt: 5, tag: 'x' },
      { id: '1', createdAt: 10, tag: 'new' },
    ];
    const out = sortedDeduped(items);
    expect(out.length).toBe(2);
    expect(out[0].id).toBe('2');
    expect(out[1].tag).toBe('new');
    expect(isSorted(out)).toBe(true);
  });

  it('deterministic order survives same-createdAt collisions', () => {
    const items = [
      { createdAt: 10, id: 'c' },
      { createdAt: 10, id: 'a' },
      { createdAt: 10, id: 'b' },
    ];
    const out = sortedDeduped(items);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('chat/logic — reactions normalization semantics', () => {
  it('uses legacy JSONB when no normalized rows have ever existed', () => {
    const legacy = { '🔥': ['u1'] };
    const r = resolveReactions(legacy, undefined, false);
    expect(r).toEqual(legacy);
  });

  it('normalized rows always override legacy JSONB', () => {
    const legacy = { '🔥': ['u1'] };
    const normalized = new Map([['u2', '❤️']]);
    const r = resolveReactions(legacy, normalized, true);
    expect(r).toEqual({ '❤️': ['u2'] });
  });

  it('does NOT revive legacy JSONB once normalized has ever existed and is now empty', () => {
    const legacy = { '🔥': ['u1'] };
    const r = resolveReactions(legacy, new Map(), true);
    expect(r).toBeUndefined();
  });

  it('groups multiple users under the same emoji', () => {
    const normalized = new Map([['u1', '🔥'], ['u2', '🔥'], ['u3', '❤️']]);
    const r = resolveReactions(undefined, normalized, true) as Record<string, string[]>;
    expect(r['🔥'].sort()).toEqual(['u1', 'u2']);
    expect(r['❤️']).toEqual(['u3']);
  });
});

describe('chat/logic — attachment filtering', () => {
  const atts: Attachment[] = [
    { id: '1', kind: 'image', objectUrl: 'a' },
    { id: '2', kind: 'file', objectUrl: 'b', filename: 'x.pdf' },
    { id: '3', kind: 'video', objectUrl: 'c' },
    { id: '4', kind: 'gif', objectUrl: 'd' },
  ];
  it('mediaAttachments excludes files', () => {
    expect(mediaAttachments(atts).map((a) => a.id)).toEqual(['1', '3', '4']);
  });
  it('fileAttachments includes only files', () => {
    expect(fileAttachments(atts).map((a) => a.id)).toEqual(['2']);
  });
});

describe('chat/logic — reply mapping', () => {
  it('returns null when there is no replyToId', () => {
    expect(mapReplyPreview(null, undefined)).toBeNull();
  });
  it('marks deleted when source has deletedAt', () => {
    const r = mapReplyPreview('m1', { id: 'm1', text: 'x', senderName: 'A', deletedAt: '2026-01-01' });
    expect(r?.deleted).toBe(true);
    expect(r?.text).toBe('');
  });
  it('preserves text/senderName when source is not deleted', () => {
    const r = mapReplyPreview('m1', { id: 'm1', text: 'hei', senderName: 'A' });
    expect(r).toEqual({ id: 'm1', text: 'hei', senderName: 'A', deleted: false });
  });
  it('falls back to a "Slettet melding" stub if source missing', () => {
    const r = mapReplyPreview('m1', undefined);
    expect(r?.deleted).toBe(true);
    expect(r?.id).toBe('m1');
  });
});

describe('chat/logic — idempotent retry helpers', () => {
  it('detects duplicate-key errors by code and message', () => {
    expect(isDuplicateKeyError({ code: '23505' })).toBe(true);
    expect(isDuplicateKeyError({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isDuplicateKeyError({ message: 'other' })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });

  it('partitions attachments into already-uploaded vs. needs-upload', () => {
    const atts: Attachment[] = [
      { id: 'a', kind: 'image', objectUrl: 'blob:foo', file: new File([], 'x.jpg') },
      { id: 'b', kind: 'image', objectUrl: 'https://cdn/foo.jpg' }, // uploaded previously
      { id: 'c', kind: 'file', objectUrl: 'blob:bar', file: new File([], 'x.pdf') },
    ];
    expect(attachmentsNeedingUpload(atts).map((a) => a.id)).toEqual(['a', 'c']);
    expect(attachmentsAlreadyUploaded(atts).map((a) => a.id)).toEqual(['b']);
  });
});

describe('chat/logic — composite server-side cursor predicate', () => {
  it('builds a PostgREST .or() expression with a strict-before-tiebreaker AND clause', () => {
    const iso = '2026-07-20T06:00:00.000Z';
    const expr = buildBeforeCursorOrFilter({ createdAt: Date.parse(iso), id: 'mid-42' });
    expect(expr).toBe(`created_at.lt.${iso},and(created_at.eq.${iso},id.lt.mid-42)`);
  });

  it('paginating a collision set larger than a page produces neither skips nor repeats', () => {
    // Simulate 12 messages all sharing the same created_at, ids sortable descending.
    const sharedTs = Date.parse('2026-07-20T06:00:00.000Z');
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const rows = ids.map((id) => ({ id, createdAt: sharedTs }));
    const pageSize = 4;

    // Emulate server behavior: for each cursor, return rows strictly-before-cursor
    // ordered by (createdAt desc, id desc), limited to pageSize.
    const pageBefore = (cursor: { createdAt: number; id: string } | null) => {
      const candidates = rows
        .filter((r) => (cursor ? isBeforeCursor(r, cursor) : true))
        .sort((a, b) => (a.createdAt !== b.createdAt ? b.createdAt - a.createdAt : (a.id < b.id ? 1 : -1)));
      return candidates.slice(0, pageSize);
    };

    // Page 1 = newest window
    const p1 = pageBefore(null);
    expect(p1.map((r) => r.id)).toEqual(['l', 'k', 'j', 'i']);
    const c1 = oldestCursor(p1)!;
    const p2 = pageBefore(c1);
    expect(p2.map((r) => r.id)).toEqual(['h', 'g', 'f', 'e']);
    const c2 = oldestCursor(p2)!;
    const p3 = pageBefore(c2);
    expect(p3.map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    const c3 = oldestCursor(p3)!;
    const p4 = pageBefore(c3);
    expect(p4).toEqual([]);

    const allSeen = [...p1, ...p2, ...p3].map((r) => r.id).sort();
    expect(allSeen).toEqual([...ids].sort());
    // No repeats.
    expect(new Set(allSeen).size).toBe(ids.length);
  });
});

describe('chat/logic — extension sanitization', () => {
  it('lowercases and strips non-alphanumerics, caps length, falls back to bin', () => {
    expect(sanitizeExtension('foo.PNG')).toBe('png');
    expect(sanitizeExtension('foo.jp-eg')).toBe('jpeg');
    expect(sanitizeExtension('foo.longerthan8ext')).toBe('longerth');
    expect(sanitizeExtension('noext')).toBe('bin');
    expect(sanitizeExtension('foo.')).toBe('bin');
    expect(sanitizeExtension('foo.!@#')).toBe('bin');
    expect(sanitizeExtension(undefined)).toBe('bin');
  });
});

describe('chat/logic — reaction fallback durability semantics', () => {
  // Simulate the store rule: a successful normalized fetch (even with zero rows)
  // must mark the message as normalized-resolved forever after.
  it('after a normalized fetch returns zero rows, legacy JSONB never revives', () => {
    // Before any fetch — legacy is visible.
    let hasEver = false;
    const legacy = { '🔥': ['u1'] };
    expect(resolveReactions(legacy, undefined, hasEver)).toEqual(legacy);

    // Simulate the store marking hasEver=true after a successful (zero-row) fetch.
    hasEver = true;
    expect(resolveReactions(legacy, undefined, hasEver)).toBeUndefined();
    // And a reload that returns zero rows again does not revive it.
    expect(resolveReactions(legacy, new Map(), hasEver)).toBeUndefined();
  });
});

import { normalizeAttachment } from '@/chat/logic';

describe('chat/logic — normalizeAttachment (Slice 1 backfill parser)', () => {
  const PREFIX = 'https://psupgftxzyoyeyuhtqgw.supabase.co/storage/v1/object/public/chat-media/';

  it('derives stable bucket/path from legacy public objectUrl and thumbUrl', () => {
    const legacy = {
      id: 'a1',
      kind: 'image',
      objectUrl: `${PREFIX}user1/pic.jpg`,
      thumbUrl: `${PREFIX}user1/pic_thumb.jpg`,
    };
    const n = normalizeAttachment(legacy);
    expect(n.storageBucket).toBe('chat-media');
    expect(n.storagePath).toBe('user1/pic.jpg');
    expect(n.thumbnailPath).toBe('user1/pic_thumb.jpg');
    // Legacy URLs preserved for fallback / rollback.
    expect(n.objectUrl).toBe(legacy.objectUrl);
    expect(n.thumbUrl).toBe(legacy.thumbUrl);
  });

  it('prefers explicit stable fields over parsed URL fields', () => {
    const n = normalizeAttachment({
      id: 'a2', kind: 'video',
      objectUrl: `${PREFIX}old/path.mov`,
      storageBucket: 'chat-media',
      storagePath: 'new/path.mp4',
    });
    expect(n.storagePath).toBe('new/path.mp4');
    expect(n.storageBucket).toBe('chat-media');
  });

  it('does not crash on non-storage URLs (e.g. Giphy) — keeps legacy fields', () => {
    const n = normalizeAttachment({
      id: 'a3', kind: 'gif',
      objectUrl: 'https://media.giphy.com/media/xyz/giphy.gif',
    });
    expect(n.storagePath).toBeUndefined();
    expect(n.storageBucket).toBeUndefined();
    expect(n.objectUrl).toContain('giphy');
  });
});

import { serializeAttachmentForPersist } from '@/chat/logic';

describe('chat/logic — serializeAttachmentForPersist (stable-only for NEW stored)', () => {
  const forbidden = (v: string | undefined | null) => {
    if (!v) return false;
    if (v.startsWith('blob:')) return true;
    if (v.includes('/storage/v1/object/public/')) return true;
    if (v.includes('/storage/v1/object/sign/')) return true; // signed
    if (v.includes('token=')) return true; // signed URL query
    return false;
  };

  it('NEW stored image attachment persists only stable coordinates (no blob/public/signed URL)', () => {
    const a = {
      id: 'x1', kind: 'image' as const,
      objectUrl: 'blob:http://localhost:8080/abc',
      thumbUrl: 'blob:http://localhost:8080/thumb',
      storageBucket: 'chat-media' as const,
      storagePath: 'user1/uuid.jpg',
      thumbnailPath: 'user1/uuid_thumb.jpg',
      filename: 'photo.jpg', mime: 'image/jpeg', size: 12345,
      // File handle must never leak into JSONB.
      file: new File([new Uint8Array(1)], 'photo.jpg', { type: 'image/jpeg' }),
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.storageBucket).toBe('chat-media');
    expect(out.storagePath).toBe('user1/uuid.jpg');
    expect(out.thumbnailPath).toBe('user1/uuid_thumb.jpg');
    expect(out.filename).toBe('photo.jpg');
    expect(out.mime).toBe('image/jpeg');
    expect(out.size).toBe(12345);
    // These must NOT appear on stable serialization.
    expect(out.objectUrl).toBeUndefined();
    expect(out.thumbUrl).toBeUndefined();
    expect((out as Record<string, unknown>).file).toBeUndefined();
    // Sanity: no forbidden URL slipped into any string field.
    for (const v of Object.values(out)) {
      if (typeof v === 'string') expect(forbidden(v)).toBe(false);
    }
  });

  it('NEW stored video with public thumbnail URL still persists only stable paths', () => {
    // Simulates what uploadOne used to do (persisting getPublicUrl). Even if
    // an Attachment enters the serializer carrying legacy URL fields alongside
    // stable coordinates, we must strip the URLs.
    const a = {
      id: 'x2', kind: 'video' as const,
      objectUrl: 'https://psupgftxzyoyeyuhtqgw.supabase.co/storage/v1/object/public/chat-media/u/1.mp4',
      thumbUrl: 'https://psupgftxzyoyeyuhtqgw.supabase.co/storage/v1/object/public/chat-media/u/1_thumb.jpg',
      storageBucket: 'chat-media' as const,
      storagePath: 'u/1.mp4',
      thumbnailPath: 'u/1_thumb.jpg',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.storagePath).toBe('u/1.mp4');
    expect(out.thumbnailPath).toBe('u/1_thumb.jpg');
    expect(out.objectUrl).toBeUndefined();
    expect(out.thumbUrl).toBeUndefined();
    for (const v of Object.values(out)) {
      if (typeof v === 'string') expect(forbidden(v)).toBe(false);
    }
  });

  it('signed URL leaking in must not be persisted', () => {
    const a = {
      id: 'x3', kind: 'image' as const,
      objectUrl: 'https://psupgftxzyoyeyuhtqgw.supabase.co/storage/v1/object/sign/chat-media/u/1.jpg?token=abc.def.ghi',
      storageBucket: 'chat-media' as const,
      storagePath: 'u/1.jpg',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.objectUrl).toBeUndefined();
    for (const v of Object.values(out)) {
      if (typeof v === 'string') expect(forbidden(v)).toBe(false);
    }
  });

  it('historical legacy public URL WITHOUT stable path is preserved (backward compat)', () => {
    const a = {
      id: 'h1', kind: 'image' as const,
      objectUrl: 'https://example.supabase.co/storage/v1/object/public/chat-media/legacy/path.jpg',
      thumbUrl: 'https://example.supabase.co/storage/v1/object/public/chat-media/legacy/path_thumb.jpg',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.objectUrl).toBe(a.objectUrl);
    expect(out.thumbUrl).toBe(a.thumbUrl);
    expect(out.storageBucket).toBeUndefined();
    expect(out.storagePath).toBeUndefined();
  });

  it('external Giphy passthrough (no stable path) is preserved', () => {
    const a = {
      id: 'g1', kind: 'gif' as const,
      objectUrl: 'https://media.giphy.com/media/xyz/giphy.gif',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.objectUrl).toBe(a.objectUrl);
    expect(out.storagePath).toBeUndefined();
  });

  it('blob URL WITHOUT stable path is never persisted (safety net)', () => {
    const a = {
      id: 'b1', kind: 'image' as const,
      objectUrl: 'blob:http://localhost:8080/never-uploaded',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.objectUrl).toBeUndefined();
  });

  it('poll cards still serialize their poll_* metadata', () => {
    const a = {
      id: 'p1', kind: 'poll' as unknown as 'image',
      objectUrl: '', poll_id: 'poll-123', poll_event: 'created',
    };
    const out = serializeAttachmentForPersist(a);
    expect(out.poll_id).toBe('poll-123');
    expect(out.poll_event).toBe('created');
  });
});

describe('chat/logic — needing/alreadyUploaded with stable paths', () => {
  it('a stable storageBucket+storagePath counts as uploaded, even with empty objectUrl', () => {
    const a = { id: 'u1', kind: 'image' as const, objectUrl: '', storageBucket: 'chat-media' as const, storagePath: 'u/1.jpg' };
    expect(attachmentsAlreadyUploaded([a])).toHaveLength(1);
    expect(attachmentsNeedingUpload([a])).toHaveLength(0);
  });

  it('a blob URL with no stable path still needs upload', () => {
    const a = { id: 'u2', kind: 'image' as const, objectUrl: 'blob:http://x/y', file: new File([new Uint8Array(1)], 'a.jpg') };
    expect(attachmentsNeedingUpload([a])).toHaveLength(1);
    expect(attachmentsAlreadyUploaded([a])).toHaveLength(0);
  });

  it('a File handle without stable path needs upload even when objectUrl is empty', () => {
    const a = { id: 'u3', kind: 'image' as const, objectUrl: '', file: new File([new Uint8Array(1)], 'a.jpg') };
    expect(attachmentsNeedingUpload([a])).toHaveLength(1);
  });

  it('an external URL (Giphy) with no file/blob counts as already-uploaded passthrough', () => {
    const a = { id: 'u4', kind: 'gif' as const, objectUrl: 'https://media.giphy.com/x.gif' };
    expect(attachmentsAlreadyUploaded([a])).toHaveLength(1);
    expect(attachmentsNeedingUpload([a])).toHaveLength(0);
  });
});
