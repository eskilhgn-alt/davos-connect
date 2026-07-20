/**
 * StoryViewer – Snapchat/Instagram-style fullscreen viewer
 * Features: progress bars, tap left/right, swipe between users, pause on hold, view counter, likes,
 * deep-link initialStoryIndex, own-story delete with confirmation, aria labels, Escape closes.
 */

import * as React from "react";
import { X, Heart, AlertTriangle, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StoryViewers } from "@/components/stories/StoryViewers";
import type { Story, StoryGroup, DeleteResult } from "@/hooks/useStories";
import { applyOptimisticLike, computeNextAfterDelete, classifyGesture, nextGroupTarget, shouldWarnForViewedResult, shouldApplyLikeResult } from "@/features/stories/helpers";
import { useSignedMedia } from "@/components/ui/SignedMedia";
import { signBatch } from "@/lib/mediaUrl";
import { toast } from "sonner";

interface StoryViewerProps {
  groups: StoryGroup[];
  initialGroupIndex: number;
  initialStoryIndex?: number;
  onClose: () => void;
  onViewed: (storyId: string) => Promise<{ ok: boolean; error?: string }> | void;
  onDelete?: (story: Story) => Promise<DeleteResult>;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({
  groups,
  initialGroupIndex,
  initialStoryIndex = 0,
  onClose,
  onViewed,
  onDelete,
}) => {
  const { user } = useAuth();
  const [groupIdx, setGroupIdx] = React.useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = React.useState(initialStoryIndex);
  const [progress, setProgress] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(0);
  const [likeAnimating, setLikeAnimating] = React.useState(false);
  const [likePending, setLikePending] = React.useState(false);
  const [mediaError, setMediaError] = React.useState(false);
  const [mediaLoaded, setMediaLoaded] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval>>();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Resync when the deep-link target changes.
  React.useEffect(() => {
    setGroupIdx(initialGroupIndex);
    setStoryIdx(initialStoryIndex);
  }, [initialGroupIndex, initialStoryIndex]);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isOwnStory = !!story && !!user && story.userId === user.id;
  const DISPLAY_MS = story?.type === "video" ? (story.durationSec || 10) * 1000 : 5000;

  // Resolver-backed URL: auto-refreshes shortly before expiry.
  const media = useSignedMedia("stories", story?.storagePath, story?.publicUrl || undefined);
  const mediaLoadRetriedRef = React.useRef(false);

  React.useEffect(() => {
    setMediaError(false);
    setMediaLoaded(false);
    setMenuOpen(false);
    setConfirmDelete(false);
    mediaLoadRetriedRef.current = false;
  }, [groupIdx, storyIdx]);

  // Prefetch next stories via signBatch (fresh signed URLs, not stale ones).
  React.useEffect(() => {
    if (!group) return;
    // Derive type from the target story, not from the signed URL (which has query params).
    const targets: Array<{ path: string; type: "image" | "video" }> = [];
    if (storyIdx < group.stories.length - 1) {
      const s = group.stories[storyIdx + 1];
      targets.push({ path: s.storagePath, type: s.type === "video" ? "video" : "image" });
    }
    if (groupIdx < groups.length - 1) {
      const s = groups[groupIdx + 1].stories[0];
      targets.push({ path: s.storagePath, type: s.type === "video" ? "video" : "image" });
    }
    if (targets.length === 0) return;
    signBatch("stories", targets.map((t) => t.path)).then((map) => {
      targets.forEach(({ path, type }) => {
        const url = map.get(path);
        if (!url) return;
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = url;
        link.as = type === "video" ? "video" : "image";
        document.head.appendChild(link);
        setTimeout(() => link.remove(), 30000);
      });
    }).catch(() => { /* prefetch is best-effort */ });
  }, [groupIdx, storyIdx, group, groups]);


  // Async onViewed: at most one nonblocking Norwegian warning per viewer session
  // for a real error. Ignore no_user/not_found. Prevent stale/unmounted warnings.
  const viewedWarnedRef = React.useRef(false);
  const unmountedRef = React.useRef(false);
  React.useEffect(() => () => { unmountedRef.current = true; }, []);
  React.useEffect(() => {
    if (!story) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await Promise.resolve(onViewed(story.id));
        if (cancelled || unmountedRef.current) return;
        if (shouldWarnForViewedResult(res as any, { alreadyWarned: viewedWarnedRef.current })) {
          viewedWarnedRef.current = true;
          toast.warning("Kunne ikke registrere at storyen ble sett");
        }
      } catch {
        if (cancelled || unmountedRef.current) return;
        if (!viewedWarnedRef.current) {
          viewedWarnedRef.current = true;
          toast.warning("Kunne ikke registrere at storyen ble sett");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [story?.id]); // eslint-disable-line


  const likeReqIdRef = React.useRef(0);
  const [likeError, setLikeError] = React.useState<string | null>(null);
  const [likeRetryTick, setLikeRetryTick] = React.useState(0);
  React.useEffect(() => {
    if (!story || !user) return;
    setLikeError(null);
    const myReq = ++likeReqIdRef.current;
    let cancelled = false;
    const fetchLikes = async () => {
      const [countRes, myLikeRes] = await Promise.all([
        supabase.from("story_likes").select("*", { count: "exact", head: true }).eq("story_id", story.id),
        supabase.from("story_likes").select("story_id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle(),
      ]);
      // Discard if a newer request has started, the story changed, or unmount.
      if (!shouldApplyLikeResult(likeReqIdRef.current, myReq, cancelled)) return;
      if (countRes.error || myLikeRes.error) {
        console.warn("[StoryViewer] like fetch failed:", countRes.error || myLikeRes.error);
        setLikeError((countRes.error || myLikeRes.error)?.message || "Kunne ikke laste hjerter");
        return;
      }
      setLikeError(null);
      setLikeCount(countRes.count || 0);
      setLiked(!!myLikeRes.data);
    };
    fetchLikes();
    return () => { cancelled = true; };
  }, [story?.id, user, likeRetryTick]); // eslint-disable-line
  const retryLikes = React.useCallback(() => setLikeRetryTick((t) => t + 1), []);



  React.useEffect(() => {
    if (!story || paused || mediaError || !mediaLoaded || deleting) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setProgress(0);
    const interval = 50;
    const step = (interval / DISPLAY_MS) * 100;
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { goNext(); return 0; }
        return p + step;
      });
    }, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [groupIdx, storyIdx, DISPLAY_MS, paused, mediaError, mediaLoaded, deleting]); // eslint-disable-line

  const closingRef = React.useRef(false);

  const goNext = React.useCallback(() => {
    if (!group || closingRef.current) return;
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((i) => i + 1);
      setStoryIdx(0);
    } else {
      closingRef.current = true;
      onClose();
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose]);

  const goPrev = React.useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((i) => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx((i) => i - 1);
      setStoryIdx(groups[groupIdx - 1].stories.length - 1);
    }
  }, [storyIdx, groupIdx, groups]);

  const handleLike = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!story || !user || likePending) return;
    const before = { liked, count: likeCount };
    const next = applyOptimisticLike(before, !liked);
    setLiked(next.liked);
    setLikeCount(next.count);
    if (next.liked) { setLikeAnimating(true); setTimeout(() => setLikeAnimating(false), 600); }
    setLikePending(true);
    try {
      const res = next.liked
        ? await supabase.from("story_likes").insert({ story_id: story.id, user_id: user.id } as any)
        : await supabase.from("story_likes").delete().eq("story_id", story.id).eq("user_id", user.id);
      if (res.error && (res.error as { code?: string }).code !== "23505") throw res.error;
    } catch (err) {
      console.warn("[StoryViewer] like failed:", err);
      setLiked(before.liked);
      setLikeCount(before.count);
      toast.error("Kunne ikke oppdatere hjerte");
    } finally {
      setLikePending(false);
    }
  }, [story, user, liked, likeCount, likePending]);

  const handleDelete = React.useCallback(async () => {
    if (!story || !onDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await onDelete(story);
      if (res.storageCleanupWarning) toast.warning(`Story slettet – ${res.storageCleanupWarning}`);
      else toast.success("Story slettet");
      const nextLoc = computeNextAfterDelete(groups, story.id, groupIdx, storyIdx);
      if (!nextLoc) { closingRef.current = true; onClose(); return; }
      setGroupIdx(nextLoc.groupIndex);
      setStoryIdx(nextLoc.storyIndex);
    } catch (err) {
      console.error("[StoryViewer] delete failed:", err);
      toast.error("Kunne ikke slette story");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
      setMenuOpen(false);
    }
  }, [story, onDelete, deleting, groups, groupIdx, storyIdx, onClose]);

  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const holdRef = React.useRef(false);
  const gestureRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const goNextGroup = React.useCallback(() => {
    const target = nextGroupTarget(groups, groupIdx, "left");
    if (!target) return;
    setGroupIdx(target.groupIndex);
    setStoryIdx(target.storyIndex);
  }, [groupIdx, groups]);
  const goPrevGroup = React.useCallback(() => {
    const target = nextGroupTarget(groups, groupIdx, "right");
    if (!target) return;
    setGroupIdx(target.groupIndex);
    setStoryIdx(target.storyIndex);
  }, [groupIdx, groups]);

  const pointerIdRef = React.useRef<number | null>(null);
  const releasePointer = (e?: React.PointerEvent) => {
    const target = (e?.currentTarget ?? null) as (Element & { releasePointerCapture?: (id: number) => void }) | null;
    const id = pointerIdRef.current;
    if (target && id != null && target.hasPointerCapture?.(id)) {
      try { target.releasePointerCapture(id); } catch { /* ignore */ }
    }
    pointerIdRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (menuOpen || confirmDelete) return;
    // Excluded controls set data-story-control="1"; do not capture on those.
    const inControl = (e.target as HTMLElement | null)?.closest?.('[data-story-control="1"]');
    if (inControl) return;
    gestureRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    holdRef.current = false;
    // Capture the pointer so we still get pointercancel/lostpointercapture even
    // if the finger drifts out of the root element.
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      pointerIdRef.current = e.pointerId;
    } catch { /* ignore */ }
    holdTimerRef.current = setTimeout(() => {
      holdRef.current = true;
      setPaused(true);
      if (videoRef.current) videoRef.current.pause();
    }, 220);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!gestureRef.current) return;
    const dx = e.clientX - gestureRef.current.x;
    const dy = e.clientY - gestureRef.current.y;
    // Any real movement cancels the hold timer.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = undefined; }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = undefined; }
    releasePointer(e);
    if (closingRef.current) return;
    if (menuOpen || confirmDelete) return;
    if (holdRef.current) {
      setPaused(false);
      if (videoRef.current) videoRef.current.play().catch(() => {});
      holdRef.current = false;
      gestureRef.current = null;
      return;
    }
    const start = gestureRef.current;
    gestureRef.current = null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = start ? e.clientX - start.x : 0;
    const dy = start ? e.clientY - start.y : 0;
    const durationMs = start ? Date.now() - start.t : 0;
    const g = classifyGesture({
      dx, dy, durationMs,
      width: rect.width,
      startX: (start?.x ?? e.clientX) - rect.left,
    });
    if (g === "swipe-left") goNextGroup();
    else if (g === "swipe-right") goPrevGroup();
    else if (g === "tap-left") goPrev();
    else if (g === "tap-right" || g === "none") goNext();
  };

  // pointercancel / lostpointercapture must clear pause+hold or the story stays frozen.
  const handlePointerCancel = (e?: React.PointerEvent) => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = undefined; }
    if (holdRef.current) {
      setPaused(false);
      if (videoRef.current) videoRef.current.play().catch(() => {});
    }
    holdRef.current = false;
    gestureRef.current = null;
    releasePointer(e);
  };


  const handleClose = React.useCallback((e: React.MouseEvent | React.PointerEvent | KeyboardEvent) => {
    if ("stopPropagation" in e) e.stopPropagation();
    if ("preventDefault" in e) e.preventDefault();
    closingRef.current = true;
    requestAnimationFrame(() => onClose());
  }, [onClose]);

  // Escape closes; also closes any open menu first.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmDelete) { setConfirmDelete(false); return; }
      if (menuOpen) { setMenuOpen(false); return; }
      handleClose(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, confirmDelete, handleClose]);

  React.useEffect(() => {
    return () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); };
  }, []);

  React.useEffect(() => {
    const blocker = (e: Event) => {
      if (closingRef.current) { e.stopPropagation(); e.preventDefault(); }
    };
    document.addEventListener("click", blocker, true);
    return () => document.removeEventListener("click", blocker, true);
  }, []);

  if (!story) return null;

  const timeAgo = (() => {
    const diff = Date.now() - new Date(story.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}t`;
  })();

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Historie fra ${group.displayName}`}
      className="fixed inset-0 z-50 bg-black flex flex-col touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      <div
        className="absolute top-0 left-0 right-0 z-10 flex gap-[3px] px-2"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}
      >
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[2.5px] bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width: i < storyIdx ? "100%" : i === storyIdx ? `${Math.min(progress, 100)}%` : "0%",
                transition: i === storyIdx ? "none" : undefined,
              }}
            />
          </div>
        ))}
      </div>

      <div
        className="absolute left-0 right-0 z-10 flex items-center justify-between px-3"
        style={{ top: "max(calc(env(safe-area-inset-top, 0px) + 14px), 22px)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)" }}
          >
            {group.displayName[0]?.toUpperCase()}
          </div>
          <div>
            <span className="text-white font-semibold text-sm">{group.displayName}</span>
            <span className="text-white/50 text-xs ml-2">{timeAgo}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isOwnStory && onDelete && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { stop(e); setMenuOpen((v) => !v); }}
                onPointerDown={stop}
                onPointerUp={stop}
                aria-label="Flere valg"
                aria-expanded={menuOpen}
                className="p-2 min-w-[44px] min-h-[44px] rounded-full bg-black/30 text-white backdrop-blur-sm"
              >
                <MoreVertical size={20} aria-hidden />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  onPointerDown={stop}
                  onPointerUp={stop}
                  onClick={stop}
                  className="absolute right-0 mt-1 rounded-lg bg-black/85 backdrop-blur-sm text-white text-sm shadow-lg overflow-hidden"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}
                    className="flex items-center gap-2 px-4 py-3 min-h-[44px] hover:bg-white/10 w-full text-left"
                  >
                    <Trash2 size={16} aria-hidden />
                    Slett story
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleClose}
            onPointerDown={stop}
            onPointerUp={(e) => { stop(e); e.preventDefault(); }}
            aria-label="Lukk historie"
            className="p-2 min-w-[44px] min-h-[44px] rounded-full bg-black/30 text-white backdrop-blur-sm"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div
          role="alertdialog"
          aria-label="Bekreft sletting"
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <div className="bg-background rounded-2xl p-5 mx-6 max-w-xs w-full space-y-3 text-center">
            <p className="text-sm font-medium">Slette denne storyen?</p>
            <p className="text-xs text-muted-foreground">Handlingen kan ikke angres.</p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full bg-muted text-foreground text-sm font-medium min-h-[44px]"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold min-h-[44px] flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Trash2 size={14} aria-hidden />}
                {deleting ? "Sletter…" : "Slett"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {!mediaLoaded && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center z-[1]">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-label="Laster" />
          </div>
        )}

        {(mediaError || media.status === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[1] gap-3" role="alert">
            <AlertTriangle size={32} className="text-white/60" aria-hidden />
            <p className="text-white/60 text-sm">Kunne ikke laste innhold</p>
            <button
              type="button"
              onPointerDown={stop}
              onPointerUp={(e) => { stop(e); e.preventDefault(); }}
              onClick={(e) => {
                stop(e);
                setMediaError(false);
                setMediaLoaded(false);
                mediaLoadRetriedRef.current = false;
                media.retry();
              }}
              aria-label="Prøv å laste på nytt"
              className="px-4 py-2 min-h-[44px] rounded-full bg-white/20 text-white text-sm backdrop-blur-sm"
            >
              Prøv igjen
            </button>
          </div>
        )}

        {/* Only render media once the signed resolver has produced a URL.
            We must NOT fall back to story.publicUrl while a storagePath exists —
            that would leak the private object through a stale public URL. */}
        {!media.url && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
            Laster…
          </div>
        )}
        {media.url && (story.type === "video" ? (
          <video
            ref={videoRef}
            key={story.id}
            src={media.url}
            autoPlay
            playsInline
            muted
            preload="auto"
            className={cn("w-full h-full object-cover transition-opacity", mediaLoaded ? "opacity-100" : "opacity-0")}
            onEnded={goNext}
            onLoadedData={(e) => {
              setMediaLoaded(true);
              const v = e.currentTarget;
              v.play().then(() => { v.muted = false; }).catch(() => {});
            }}
            onError={() => {
              if (!mediaLoadRetriedRef.current) {
                mediaLoadRetriedRef.current = true;
                media.retry();
              } else {
                setMediaError(true);
              }
            }}
            onStalled={() => {
              setTimeout(() => {
                if (videoRef.current && videoRef.current.readyState < 3) videoRef.current.load();
              }, 5000);
            }}
          />
        ) : (
          <img
            key={story.id}
            src={media.url}
            alt=""
            className={cn("w-full h-full object-cover transition-opacity", mediaLoaded ? "opacity-100" : "opacity-0")}
            draggable={false}
            onLoad={() => setMediaLoaded(true)}
            onError={() => {
              if (!mediaLoadRetriedRef.current) {
                mediaLoadRetriedRef.current = true;
                media.retry();
              } else {
                setMediaError(true);
              }
            }}
          />
        ))}
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4"
        style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), 20px)" }}
      >
        <button
          type="button"
          onClick={handleLike}
          onPointerDown={stop}
          onPointerUp={(e) => { stop(e); e.preventDefault(); }}
          disabled={likePending}
          aria-label={liked ? "Fjern hjerte" : "Gi hjerte"}
          aria-pressed={liked}
          className="flex items-center gap-1.5 py-2 px-3 min-h-[44px] rounded-full bg-black/40 backdrop-blur-sm active:scale-95 transition-transform disabled:opacity-70"
        >
          <Heart
            size={20}
            aria-hidden
            className={cn(
              "transition-all",
              liked ? "fill-red-500 text-red-500" : "text-white",
              likeAnimating && "scale-125"
            )}
          />
          {likeCount > 0 && (
            <span className="text-white text-xs font-medium">{likeCount}</span>
          )}
        </button>

        {story && user && (
          <StoryViewers storyId={story.id} isOwner={story.userId === user.id} />
        )}
      </div>
    </div>
  );
};
