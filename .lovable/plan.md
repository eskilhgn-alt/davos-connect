# Gallery Slice 4 + StoryViewer pointer regression

Two independent workstreams. No production publish. No bucket privacy flip. No changes to existing rows/objects. Migrations only if a genuinely absent column is required for feature parity.

## A) StoryViewer pointer-release ordering (small, first)

`handlePointerUp` currently calls `releasePointer(e)` before consuming `gestureRef.current`. Explicit release synchronously fires `onLostPointerCapture` → `handlePointerCancel` clears `gestureRef` and hold — so the up-classifier sees empty state and swipe/tap can misfire.

Fix in `src/components/stories/StoryViewer.tsx`:
1. Snapshot `gestureRef.current` and `holdRef.current` at the top of `handlePointerUp`.
2. Set a `suppressCancelRef` flag while releasing; `handlePointerCancel` early-returns when set (still handles real cancel/lost).
3. Release pointer AFTER computing gesture and dispatching nav.
4. `pointercancel`/`lostpointercapture` (real, not our own release) must still clear hold, resume video, reset refs — as today.
5. Controls remain excluded via `data-story-control`.

New pure helper in `src/features/stories/helpers.ts`: `resolvePointerRelease({phase, isExplicitRelease, hasHold})` returning `{ resumeVideo, clearGesture, releaseCapture }`. Regression tests in `src/features/stories/__tests__/qa-regressions.test.ts`:
- explicit-release-during-up preserves gesture for classification
- real pointercancel always clears+resumes
- lost-capture during move (no up) clears+resumes

## B) Gallery Slice 4

### Architecture split

Current `src/pages/GalleryScreen.tsx` (~537 lines, monolithic) becomes:

```text
src/features/gallery/
  types.ts                    GalleryRow, ProfileLite, CommentRow, CursorKey
  helpers.ts                  pure logic (cursor merge, optimistic like/comment, delete-decision, poster-fallback)
  useGalleryFeed.ts           cursor pagination + incremental realtime + errors
  useGalleryLikes.ts          optimistic like/unlike w/ request identity
  useGalleryComments.ts       paginated + optimistic + retry per item
  useGalleryUpload.ts         phased upload w/ per-attempt path ownership + cleanup
  components/
    GridThumb.tsx
    UploadSheet.tsx           preview + caption + phases
    ViewerSheet.tsx           fullscreen with swipe/keys/prefetch
    CommentSheet.tsx
    DeleteDialog.tsx
  __tests__/
    helpers.test.ts           (regressions)
src/pages/GalleryScreen.tsx   thin composition, keeps route
```

No parallel gallery implementation — the page still lives at `/galleri` and reuses the same DB schema.

### Fetch/list (cursor pagination)

- Order: `created_at desc, id desc`. Initial page 30, "Last inn mer" fetches next 30 using composite cursor via `.or("created_at.lt.<t>,and(created_at.eq.<t>,id.lt.<uuid>)")`.
- Realtime: `gallery_items` INSERT prepends; UPDATE merges by id; DELETE removes by id. `gallery_likes`/`gallery_comments` update only affected item state (like set add/remove; comment count / list append).
- Errors on gallery/profile/like batch queries → visible retry state (Norwegian: "Kunne ikke laste galleri" + "Prøv igjen"), no silent empty grid.
- 14 existing rows unchanged.

### Upload UX

`UploadSheet` opens on `+`:
- Choose image or video via one input.
- Preview (image `<img>`, video `<video playsInline muted>`).
- Caption textarea (max 500, char counter).
- Cancel / Del.
- Phases: `Forbereder… → Laster opp… → Publiserer…`.

Validation:
- size > 0 and ≤ 20 MB after re-encode.
- MIME allowlist for images (`image/jpeg|png|webp|heic|heif|gif`) and video (`video/mp4|webm|quicktime`).
- After re-encode revalidate blob size/type.
- Images: `reencodeImage` → JPEG max 2000px q0.9 (strips EXIF via canvas). Thumbnail via `createThumbnail`.
- Video: read metadata; try poster from seeked frame; on failure store `thumbnail_path=null` and rely on `posterFallback` helper (Play icon on gradient tile) — never `<img src="">`.

Path ownership: track `uploadedPaths: string[]` in an attempt-scoped ref. On any failure, `supabase.storage.from(bucket).remove(paths)` only those paths. Never touch historical objects. Cleanup errors → toast warning, still surface original failure.

Insert into `gallery_items` with `caption, uploaded_by, storage_bucket='chat-media', storage_path, thumbnail_path, type, mime_type, size_bytes, width, height`. All columns exist — no migration needed.

### Viewer

`ViewerSheet` (fullscreen dialog):
- Prev/next arrows (desktop), horizontal swipe (mobile) — reuse `classifyGesture`.
- Keyboard: `ArrowLeft`/`ArrowRight`/`Escape`.
- Loading skeleton until signed URL resolves; error → visible retry.
- Prefetch neighbors via `signBatch([prev, next])`.
- Videos: `<video controls playsInline preload="metadata">`; images: `<img>` `object-contain`.
- No `publicUrl` fallback when `storage_path` exists.
- Single close (top-right X). 44px targets. `aria-*` labels.
- Bottom panel: avatar + name, timestamp, caption, like heart + count, comment icon opening `CommentSheet`.

### Likes

`useGalleryLikes`:
- Optimistic toggle updates `Set<userId>` immediately.
- Track `requestId` per item; only apply server result if request is latest.
- Unique-constraint violation on insert (duplicate like) treated as success.
- On network error → rollback + toast.
- Realtime INSERT/DELETE merges into set (idempotent).

### Comments

`CommentSheet`:
- Sheet from bottom, textarea + send button.
- Paginated: initial 30, "Last inn eldre" upward using created_at asc cursor.
- Optimistic append with `client_id` (uuid, generated locally). No schema change — client_id lives in local state only, matched to server row by (user_id, body, created_at±) or replaced when realtime INSERT arrives (dedupe helper).
- Failed comment stays with `state: 'failed'` + Retry button; input NOT cleared until an optimistic row visibly owns the draft.
- Max 500 chars, honest counter.
- Realtime INSERT/DELETE incremental.

### Delete

`DeleteDialog` (AlertDialog):
- Only owner or admin sees delete button.
- If `source_message_id || source_story_id`: title "Fjern fra galleri" + body "Original i chat/stories forblir." Deletes only DB row.
- Else (direct upload): "Slett fra galleri" + body "Bildet fjernes permanent." Deletes DB row, then `storage.remove([storage_path, thumbnail_path].filter)`. Best-effort; cleanup error → warn toast, DB delete already succeeded.
- Never `window.confirm`.
- On success: if the deleted item was open in viewer, close viewer; realtime DELETE will remove from grid.

### Helpers (pure, tested)

`mergeCursorPage(existing, incoming)` — dedupe by id, keep desc order.
`applyOptimisticLike(state, itemId, userId, action)` + `shouldApplyLikeResult(currentReq, resultReq)`.
`applyOptimisticComment(list, draft)` + `replaceOptimisticWithServer(list, serverRow)`.
`decideDeleteMode(item)` → `'direct' | 'derived'`.
`videoPosterFallback(item)` → `{ useFallback: boolean }`.
`nextViewerIndex(list, currentId, dir)`.

### Tests

Add `src/features/gallery/__tests__/helpers.test.ts` covering:
- cursor merge dedupe and ordering
- optimistic like rollback + stale-result guard
- comment optimistic → server replace, failed retry preserves draft
- upload cleanup path ownership (only attempt-owned paths removed)
- direct vs derived delete decision
- video poster fallback when metadata errors
- viewer nav prev/next wrap behavior

Plus StoryViewer helper tests noted above.

Target: total tests **> 123**.

### Verification commands

```
bunx vitest run
tsgo --noEmit
bun run build
```

Lint only changed files.

### Data safety

Before/after `SELECT count(*)` from `profiles, messages, attachments, gallery_items, gallery_likes, gallery_comments, stories`; and storage object counts via API. All must match. Bucket flags unchanged. No migrations executed unless a required column proves genuinely missing (spoiler: schema already supports caption/uploader/type/mime/size/thumbnail — none needed).

### Out of scope

Chat, auth, push, AI, rounds, location, bucket privacy flip, production publish.

## Deliverable order

1. StoryViewer pointer fix + helper + tests.
2. Gallery helpers + hooks + component split + tests.
3. Run full suite / typecheck / build. Report exact counts and DB baselines.
