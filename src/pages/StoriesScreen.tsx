/**
 * StoriesScreen – Full stories page with rings + grid (like Snapchat Discover)
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { StoryRing } from "@/components/stories/StoryRing";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/contexts/AuthContext";
import { Film, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const StoriesScreen: React.FC = () => {
  const { user } = useAuth();
  const { groups, loading, refetch, markViewed } = useStories();
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = React.useState(0);
  const [captureOpen, setCaptureOpen] = React.useState(false);

  const openStory = (groupIndex: number) => {
    setViewerGroupIdx(groupIndex);
    setViewerOpen(true);
  };

  // Get latest story thumbnail per group
  const getThumbUrl = (storagePath: string) => {
    const { data } = supabase.storage.from("stories").getPublicUrl(storagePath);
    return data.publicUrl;
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Historier"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Story rings */}
            <StoryRing
              groups={groups}
              loading={loading}
              onAddStory={() => setCaptureOpen(true)}
              onOpenStory={openStory}
            />

            {/* Stories grid – Snapchat Discover style */}
            {groups.length === 0 ? (
              <DavosEmptyState
                icon={Film}
                title="Ingen historier ennå"
                description="Trykk + for å dele din første story med crewet!"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groups.map((group, idx) => {
                  const latestStory = group.stories[group.stories.length - 1];
                  const thumbUrl = getThumbUrl(latestStory.storagePath);
                  const diff = Date.now() - new Date(latestStory.createdAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  const timeAgo = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}t`;

                  return (
                    <button
                      key={group.userId}
                      type="button"
                      onClick={() => openStory(idx)}
                      className={cn(
                        "relative aspect-[3/4] rounded-xl overflow-hidden",
                        "active:scale-[0.97] transition-transform"
                      )}
                    >
                      {/* Thumbnail */}
                      {latestStory.type === "image" ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <video
                          src={thumbUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      )}

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                      {/* Unviewed indicator */}
                      {group.hasUnviewed && (
                        <div
                          className="absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)" }}
                        >
                          {group.displayName[0]?.toUpperCase()}
                        </div>
                      )}

                      {/* Name + time */}
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <p className="text-white text-sm font-semibold truncate">
                          {group.userId === user?.id ? "Din story" : group.displayName.split(" ")[0]}
                        </p>
                        <p className="text-white/60 text-[11px]">
                          {group.stories.length} {group.stories.length === 1 ? "story" : "stories"} · {timeAgo}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Story Viewer */}
      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIdx}
          onClose={() => {
            setViewerOpen(false);
            refetch();
          }}
          onViewed={markViewed}
        />
      )}

      {/* Story Capture */}
      {captureOpen && (
        <StoryCapture
          onClose={() => setCaptureOpen(false)}
          onPublished={() => {
            setCaptureOpen(false);
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default StoriesScreen;
