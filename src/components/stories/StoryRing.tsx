/**
 * StoryRing – Horizontal scrollable story rings (Instagram/Snapchat style)
 * Shows at top of home screen with "Add" button + user rings
 */

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { StoryGroup } from "@/hooks/useStories";

interface StoryRingProps {
  groups: StoryGroup[];
  loading: boolean;
  onAddStory: () => void;
  onOpenStory: (groupIndex: number) => void;
}

export const StoryRing: React.FC<StoryRingProps> = ({
  groups,
  loading,
  onAddStory,
  onOpenStory,
}) => {
  const { user } = useAuth();

  // Find if current user has stories
  const myGroupIdx = groups.findIndex((g) => g.userId === user?.id);
  const hasMyStory = myGroupIdx >= 0;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
      {/* Din story: primary + add are SIBLING controls (no nested buttons). */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0 w-[68px]">
        <div className="relative">
          <button
            type="button"
            onClick={hasMyStory ? () => onOpenStory(myGroupIdx) : onAddStory}
            aria-label={hasMyStory ? "Åpne din story" : "Legg til story"}
            className={cn(
              "w-[60px] h-[60px] min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center",
              "active:scale-95 transition-transform",
              hasMyStory
                ? groups[myGroupIdx].hasUnviewed
                  ? "ring-[2.5px] ring-primary ring-offset-2 ring-offset-background"
                  : "ring-[2px] ring-border ring-offset-1 ring-offset-background"
                : "border-2 border-dashed border-muted-foreground/40"
            )}
          >
            {hasMyStory ? (
              <span className="text-lg font-bold text-foreground">
                {groups[myGroupIdx].displayName[0]?.toUpperCase()}
              </span>
            ) : (
              <Plus size={22} className="text-muted-foreground" aria-hidden />
            )}
          </button>
          {hasMyStory && (
            <button
              type="button"
              onClick={onAddStory}
              aria-label="Legg til ny story"
              className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-primary flex items-center justify-center border-2 border-background active:scale-90 transition-transform"
            >
              <Plus size={12} className="text-primary-foreground" strokeWidth={3} aria-hidden />
            </button>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground font-medium truncate w-full text-center">
          Din story
        </span>
      </div>

      {/* Other users' stories */}
      {groups
        .filter((g) => g.userId !== user?.id)
        .map((group) => {
          const originalIdx = groups.indexOf(group);
          return (
            <button
              key={group.userId}
              type="button"
              onClick={() => onOpenStory(originalIdx)}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-[68px] active:scale-95 transition-transform"
            >
              <div
                className={cn(
                  "w-[60px] h-[60px] rounded-full flex items-center justify-center",
                  "text-lg font-bold",
                  group.hasUnviewed
                    ? "bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white ring-[2.5px] ring-transparent ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground ring-[2px] ring-border ring-offset-1 ring-offset-background"
                )}
                style={
                  group.hasUnviewed
                    ? {
                        background: "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)",
                      }
                    : undefined
                }
              >
                {group.displayName[0]?.toUpperCase()}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium truncate w-full text-center",
                  group.hasUnviewed ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {group.displayName.split(" ")[0]}
              </span>
            </button>
          );
        })}

      {/* Loading skeletons */}
      {loading &&
        groups.length === 0 &&
        [1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0 w-[68px]">
            <div className="w-[60px] h-[60px] rounded-full bg-muted animate-pulse" />
            <div className="w-10 h-3 bg-muted rounded animate-pulse" />
          </div>
        ))}
    </div>
  );
};
