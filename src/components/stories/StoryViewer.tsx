/**
 * StoryViewer - Fullscreen story viewer (Snapchat-style)
 * Tap left/right to navigate, progress bars at top
 */

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [groupIdx, setGroupIdx] = React.useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval>>();
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const DISPLAY_MS = story?.type === "video" ? (story.durationSec || 10) * 1000 : 5000;

  // Mark as viewed
  React.useEffect(() => {
    if (story) onViewed(story.id);
  }, [story?.id]); // eslint-disable-line

  // Progress timer
  React.useEffect(() => {
    if (!story) return;
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

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [groupIdx, storyIdx, DISPLAY_MS]); // eslint-disable-line

  const goNext = React.useCallback(() => {
    if (!group) return;
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((i) => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((i) => i + 1);
      setStoryIdx(0);
    } else {
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

  const handleTap = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  };

  if (!story) return null;

  const timeAgo = (() => {
    const diff = Date.now() - new Date(story.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}t`;
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={handleTap}>
      {/* Progress bars */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-2"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}
      >
        {group.stories.map((s, i) => (
          <div key={s.id} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-none"
              style={{
                width:
                  i < storyIdx ? "100%" : i === storyIdx ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div
        className="absolute left-0 right-0 z-10 flex items-center justify-between px-4"
        style={{ top: "max(calc(env(safe-area-inset-top, 0px) + 16px), 24px)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
            {group.displayName[0]?.toUpperCase()}
          </div>
          <span className="text-white font-medium text-sm">{group.displayName}</span>
          <span className="text-white/60 text-xs">{timeAgo}</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-2 rounded-full bg-black/30 text-white"
        >
          <X size={20} />
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center">
        {story.type === "video" ? (
          <video
            ref={videoRef}
            src={story.publicUrl}
            autoPlay
            playsInline
            muted={false}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <img
            src={story.publicUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>
    </div>
  );
};
