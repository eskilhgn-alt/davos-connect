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
import { applyOptimisticLike, computeNextAfterDelete, classifyGesture } from "@/features/stories/helpers";
import { useSignedMedia } from "@/components/ui/SignedMedia";
import { signBatch } from "@/lib/mediaUrl";
import { toast } from "sonner";

interface StoryViewerProps {
  groups: StoryGroup[];
  initialGroupIndex: number;
  initialStoryIndex?: number;
  onClose: () => void;
  onViewed: (storyId: string) => void;
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

  React.useEffect(() => {
    setMediaError(false);
    setMediaLoaded(false);
    setMenuOpen(false);
    setConfirmDelete(false);
  }, [groupIdx, storyIdx]);

  React.useEffect(() => {
    if (!group) return;
    const nextStories: string[] = [];
    if (storyIdx < group.stories.length - 1) nextStories.push(group.stories[storyIdx + 1].publicUrl);
    if (groupIdx < groups.length - 1) nextStories.push(groups[groupIdx + 1].stories[0].publicUrl);
    for (const url of nextStories) {
      if (!url) continue;
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = url;
      link.as = url.match(/\.(mp4|webm|mov)/) ? "video" : "image";
      document.head.appendChild(link);
      setTimeout(() => link.remove(), 30000);
    }
  }, [groupIdx, storyIdx, group, groups]);

  React.useEffect(() => {
    if (story) onViewed(story.id);
  }, [story?.id]); // eslint-disable-line

  React.useEffect(() => {
    if (!story || !user) return;
    const fetchLikes = async () => {
      const [{ count }, { data: myLike }] = await Promise.all([
        supabase.from("story_likes").select("*", { count: "exact", head: true }).eq("story_id", story.id),
        supabase.from("story_likes").select("story_id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle(),
      ]);
      setLikeCount(count || 0);
      setLiked(!!myLike);
    };
    fetchLikes();
  }, [story?.id, user]); // eslint-disable-line

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

  const handlePointerDown = () => {
    if (menuOpen || confirmDelete) return;
    holdRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdRef.current = true;
      setPaused(true);
      if (videoRef.current) videoRef.current.pause();
    }, 200);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = undefined; }
    if (closingRef.current) return;
    if (menuOpen || confirmDelete) return;
    if (holdRef.current) {
      setPaused(false);
      if (videoRef.current) videoRef.current.play();
      holdRef.current = false;
      return;
    }
    holdRef.current = false;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) goPrev(); else goNext();
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
      onPointerUp={handlePointerUp}
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

        {mediaError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[1] gap-3" role="alert">
            <AlertTriangle size={32} className="text-white/60" aria-hidden />
            <p className="text-white/60 text-sm">Kunne ikke laste innhold</p>
            <button
              type="button"
              onPointerDown={stop}
              onPointerUp={(e) => { stop(e); e.preventDefault(); }}
              onClick={(e) => { stop(e); setMediaError(false); setMediaLoaded(false); }}
              aria-label="Prøv å laste på nytt"
              className="px-4 py-2 min-h-[44px] rounded-full bg-white/20 text-white text-sm backdrop-blur-sm"
            >
              Prøv igjen
            </button>
          </div>
        )}

        {story.type === "video" ? (
          <video
            ref={videoRef}
            key={story.id + (mediaError ? "" : "-v")}
            src={story.publicUrl}
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
            onError={() => setMediaError(true)}
            onStalled={() => {
              setTimeout(() => {
                if (videoRef.current && videoRef.current.readyState < 3) videoRef.current.load();
              }, 5000);
            }}
          />
        ) : (
          <img
            key={story.id + (mediaError ? "" : "-i")}
            src={story.publicUrl}
            alt=""
            className={cn("w-full h-full object-cover transition-opacity", mediaLoaded ? "opacity-100" : "opacity-0")}
            draggable={false}
            onLoad={() => setMediaLoaded(true)}
            onError={() => setMediaError(true)}
          />
        )}
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
