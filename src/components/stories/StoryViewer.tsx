/**
 * StoryViewer – Snapchat/Instagram-style fullscreen viewer
 * Features: progress bars, tap left/right, swipe between users, pause on hold, view counter, likes
 * Hardened: preloading, error recovery, retry logic
 */

import * as React from "react";
import { X, Heart, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StoryViewers } from "@/components/stories/StoryViewers";
import type { StoryGroup } from "@/hooks/useStories";

interface StoryViewerProps {
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
  onViewed: (storyId: string) => void;
}

export const StoryViewer: React.FC<StoryViewerProps> = ({
  groups,
  initialGroupIndex,
  onClose,
  onViewed,
}) => {
  const { user } = useAuth();
  const [groupIdx, setGroupIdx] = React.useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [liked, setLiked] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(0);
  const [likeAnimating, setLikeAnimating] = React.useState(false);
  const [mediaError, setMediaError] = React.useState(false);
  const [mediaLoaded, setMediaLoaded] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval>>();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const DISPLAY_MS = story?.type === "video" ? (story.durationSec || 10) * 1000 : 5000;

  // Reset media state on story change
  React.useEffect(() => {
    setMediaError(false);
    setMediaLoaded(false);
  }, [groupIdx, storyIdx]);

  // Preload next story media
  React.useEffect(() => {
    if (!group) return;
    const nextStories: string[] = [];
    // Next in same group
    if (storyIdx < group.stories.length - 1) {
      nextStories.push(group.stories[storyIdx + 1].publicUrl);
    }
    // First in next group
    if (groupIdx < groups.length - 1) {
      nextStories.push(groups[groupIdx + 1].stories[0].publicUrl);
    }
    for (const url of nextStories) {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = url;
      link.as = url.match(/\.(mp4|webm|mov)/) ? "video" : "image";
      document.head.appendChild(link);
      // Clean up after 30s
      setTimeout(() => link.remove(), 30000);
    }
  }, [groupIdx, storyIdx, group, groups]);

  // Mark as viewed
  React.useEffect(() => {
    if (story) onViewed(story.id);
  }, [story?.id]); // eslint-disable-line

  // Fetch like status for current story
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

  // Progress timer - only runs when media is loaded and not paused/errored
  React.useEffect(() => {
    if (!story || paused || mediaError || !mediaLoaded) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setProgress(0);

    const interval = 50;
    const step = (interval / DISPLAY_MS) * 100;

    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          goNext();
          return 0;
        }
        return p + step;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [groupIdx, storyIdx, DISPLAY_MS, paused, mediaError, mediaLoaded]); // eslint-disable-line

  // Track closing state to prevent pointer events from leaking to elements underneath
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

  // Like handler
  const handleLike = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!story || !user) return;
    if (liked) {
      await supabase.from("story_likes").delete().eq("story_id", story.id).eq("user_id", user.id);
      setLiked(false);
      setLikeCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from("story_likes").insert({ story_id: story.id, user_id: user.id } as any);
      setLiked(true);
      setLikeCount(c => c + 1);
      setLikeAnimating(true);
      setTimeout(() => setLikeAnimating(false), 600);
    }
  }, [story, user, liked]);

  // Tap zones + hold-to-pause
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const holdRef = React.useRef(false);

  const handlePointerDown = () => {
    holdRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdRef.current = true;
      setPaused(true);
      if (videoRef.current) videoRef.current.pause();
    }, 200);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Always prevent event from reaching elements underneath
    e.preventDefault();
    e.stopPropagation();

    // Clear the hold timer if it hasn't fired yet
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = undefined;
    }
    if (closingRef.current) return;
    if (holdRef.current) {
      // Was a hold → unpause
      setPaused(false);
      if (videoRef.current) videoRef.current.play();
      holdRef.current = false;
      return;
    }
    holdRef.current = false;
    // Was a tap → navigate
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  };

  // Close handler that prevents navigation leak
  const handleClose = React.useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    closingRef.current = true;
    // Small delay to ensure pointer events don't leak through
    requestAnimationFrame(() => {
      onClose();
    });
  }, [onClose]);

  // Cleanup hold timer on unmount
  React.useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // Block all click events from propagating outside the viewer
  React.useEffect(() => {
    const blocker = (e: Event) => {
      if (closingRef.current) {
        e.stopPropagation();
        e.preventDefault();
      }
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      {/* Progress bars */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex gap-[3px] px-2"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}
      >
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[2.5px] bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width:
                  i < storyIdx ? "100%" : i === storyIdx ? `${Math.min(progress, 100)}%` : "0%",
                transition: i === storyIdx ? "none" : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div
        className="absolute left-0 right-0 z-10 flex items-center justify-between px-3"
        style={{ top: "max(calc(env(safe-area-inset-top, 0px) + 14px), 22px)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)",
            }}
          >
            {group.displayName[0]?.toUpperCase()}
          </div>
          <div>
            <span className="text-white font-semibold text-sm">{group.displayName}</span>
            <span className="text-white/50 text-xs ml-2">{timeAgo}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className="p-2 rounded-full bg-black/30 text-white backdrop-blur-sm"
        >
          <X size={20} />
        </button>
      </div>

      {/* Media – full bleed */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        {/* Loading spinner while media loads */}
        {!mediaLoaded && !mediaError && (
          <div className="absolute inset-0 flex items-center justify-center z-[1]">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Error state with retry */}
        {mediaError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[1] gap-3">
            <AlertTriangle size={32} className="text-white/60" />
            <p className="text-white/60 text-sm">Kunne ikke laste innhold</p>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={(e) => {
                e.stopPropagation();
                setMediaError(false);
                setMediaLoaded(false);
              }}
              className="px-4 py-2 rounded-full bg-white/20 text-white text-sm backdrop-blur-sm"
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
            onError={() => {
              console.error("[StoryViewer] Video load error for:", story.publicUrl);
              setMediaError(true);
            }}
            onStalled={() => {
              // Auto-retry on stall after 5s
              setTimeout(() => {
                if (videoRef.current && videoRef.current.readyState < 3) {
                  videoRef.current.load();
                }
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
            onError={() => {
              console.error("[StoryViewer] Image load error for:", story.publicUrl);
              setMediaError(true);
            }}
          />
        )}
      </div>

      {/* Bottom bar: likes + view counter */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4"
        style={{ paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), 20px)" }}
      >
        {/* Like button */}
        <button
          type="button"
          onClick={handleLike}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
          className="flex items-center gap-1.5 py-2 px-3 rounded-full bg-black/40 backdrop-blur-sm active:scale-95 transition-transform"
        >
          <Heart
            size={20}
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

        {/* View counter for own stories */}
        {story && user && (
          <StoryViewers storyId={story.id} isOwner={story.userId === user.id} />
        )}
      </div>
    </div>
  );
};
