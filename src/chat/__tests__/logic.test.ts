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
