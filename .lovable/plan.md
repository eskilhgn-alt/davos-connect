## Gallery Slice 4B — QA correction plan

Scope: main branch, no production publish, no destructive data changes. All existing gallery rows/storage objects preserved.

### Files touched

- `src/features/gallery/useGallery.ts` — feed dependency loop, per-item likes, comment `client_id` + pagination
- `src/features/gallery/helpers.ts` — cursor helpers for comments, client_id reconciliation, per-item like reconcile
- `src/features/gallery/types.ts` — add `client_id` field, comment cursor type
- `src/pages/GalleryScreen.tsx` — GridThumb/ViewerSheet broken-media UI, prefetch warmup, upload retry, auto-scroll, disable duplicate destructive submits
- `src/components/ui/SignedMedia.tsx` — expose `status`/`retry` on `SignedImg`/`SignedVideo`
- `src/features/gallery/__tests__/helpers.test.ts` — new regression tests
- `src/features/gallery/__tests__/useGallery.test.ts` — new hook tests (mount-once, per-item likes, client_id reconciliation, comment cursor merge)
- New migration: `gallery_comments.client_id uuid null` + partial unique index

### 1. Refresh dependency loop (feed)

- Move `profiles` state read behind a `profilesRef`; `loadProfiles` becomes stable (`useCallback` with empty deps).
- Dedupe in-flight profile IDs via a `Set` ref.
- Initial fetch runs once per mount via a `didInitRef`, not on every `refresh` identity change.

### 2. Signed media failure UX

- Extend `SignedImg`/`SignedVideo` to render a broken-media placeholder + "Prøv igjen" when `status === "error"` (uses existing `useSignedMedia` API).
- Wire `onError` on `<img>`/`<video>` to trigger `retry()`.
- Replace `useSignedUrl` in `GridThumb` and `ViewerSheet` with the stateful `SignedImg`/`SignedVideo`. Zero public fallback.
- Neighbor prefetch: after `signBatch`, create `new Image()` for images to warm the browser HTTP cache; skip videos.

### 3. Per-item like reconciliation

- `useGalleryLikes` state becomes a `Map<itemId, {override: Set<userId>, reqId: number}>`.
- Server `likes` map reconciles per item: only clear the override for item X when its confirmed server state matches `intent` and the response's `reqId === currentReq(itemId)`.
- Stale responses lose the race and do not roll back a newer tap.
- Insert error: treat Postgres `23505` (code) as idempotent success, in addition to legacy `/duplicate/i` fallback.

### 4. Comments idempotency via `client_id`

Migration:
```sql
ALTER TABLE public.gallery_comments ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS gallery_comments_user_client_uidx
  ON public.gallery_comments (user_id, client_id) WHERE client_id IS NOT NULL;
```
No existing row is modified. Grants unchanged.

Hook:
- Insert `client_id` on every optimistic submit.
- Realtime + reload rows carry `client_id`; `replaceOptimisticWithServer` matches strictly on `client_id` first; the 30 s legacy heuristic runs only when both server row and optimistic lack `client_id`.
- Retry re-uses the same `client_id`; duplicate-key on `(user_id, client_id)` is treated as success (idempotent).

### 5. Comment pagination

- Order `(created_at asc, id asc)` from newest cursor backwards? To stay Messenger-like we load the newest N and expose "Last inn eldre" for older pages.
- Actually keep chronological ascending order in view; internally page from newest backwards with cursor `(created_at desc, id desc)` and reverse for display. Page size 30.
- Retryable load error UI already present; extend to older-page load button.
- Optimistic drafts held in a separate list; page merges preserve them.

### 6. Refresh reconciliation

- Feed refresh only replaces likes/commentCounts for IDs in the refreshed page; older items keep their state.
- Realtime DELETE continues to work; both tables already have `REPLICA IDENTITY FULL`.

### 7. Upload hardening

- After `reencodeImage`, validate output blob MIME (`image/jpeg`) and size ≤ 20 MB; throw with Norwegian message if not.
- Video poster: attempt via `<video>` + `seekTo(0.1)` + canvas draw; on any error, skip thumb path and rely on fallback tile.
- All object URLs held in refs and revoked on cleanup + on `open=false`.
- `cleanupAttempt` already uses `ownedCleanupPaths` — keep, but ensure `historicalPaths` is derived per-attempt (already is).
- Retry: after `phase === "error"`, expose a "Prøv igjen" button that re-runs `publish` without requiring re-select.

### 8. UX details

- Comment list auto-scrolls to bottom on new optimistic entry only when user is already near the bottom (< 80px from bottom). If scrolled up reading older, don't fight.
- Deletion dialog: keep derived-mode copy.
- Disable delete action while pending (`disabled` + `aria-busy`).
- Upload "Prøv igjen" button surfaced in error state.

### 9. Regression tests

New tests (Vitest):
- `helpers.test.ts`: client_id match wins over time heuristic; time heuristic only when both lack `client_id`; per-item like reconcile; comment cursor merge preserves order + dedupes.
- `useGallery.test.ts` (jsdom, mocked supabase): initial feed fetch runs exactly once even when `profiles` state updates; toggling like on item A does not clear override on item B; stale response for item A does not roll back a newer tap; duplicate submit with same `client_id` produces one visible comment.

### Verification

- `npm test` — expect all previous + new tests green
- `npm run build` — typecheck via tsc through Vite
- `npm run lint` — fix real errors, no suppressions

### Limits / known gaps after this slice

- No server-side transcoding: video posters remain best-effort browser-side.
- Bucket privacy migration (public → private) still deferred to Slice 6 as previously agreed.
- No changes to production publish.
