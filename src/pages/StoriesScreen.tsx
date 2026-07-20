/**
 * StoriesScreen – Full stories page with rings + grid (like Snapchat Discover)
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { StoryRing } from "@/components/stories/StoryRing";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/contexts/AuthContext";
import { Film, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { findStoryLocation, firstUnviewedIndex } from "@/features/stories/helpers";
import { SignedImg, SignedVideo } from "@/components/ui/SignedMedia";
import { toast } from "sonner";

export const StoriesScreen: React.FC = () => {
  const { user } = useAuth();
  const { groups, loading, error, refetch, markViewed, deleteStory, setRefetchPaused } = useStories();
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = React.useState(0);
  const [viewerStoryIdx, setViewerStoryIdx] = React.useState(0);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkOpenedRef = React.useRef<string | null>(null);

  const openStory = (groupIndex: number, storyIndex?: number) => {
    const g = groups[groupIndex];
    const idx = storyIndex ?? firstUnviewedIndex(g);
    setViewerGroupIdx(groupIndex);
    setViewerStoryIdx(idx);
    setViewerOpen(true);
  };

  // Pause background refetches while the viewer is open so playback isn't reset.
  React.useEffect(() => {
    setRefetchPaused(viewerOpen);
    return () => setRefetchPaused(false);
  }, [viewerOpen, setRefetchPaused]);

  // Deep-link: /historier?story=<id> opens the exact story
  React.useEffect(() => {
    const target = searchParams.get("story");
    if (!target || loading) return;
    if (deepLinkOpenedRef.current === target) return;
    // Do not clear if the fetch failed — user can retry.
    if (error) return;

    const loc = findStoryLocation(groups, target);
    if (loc) {
      deepLinkOpenedRef.current = target;
      setViewerGroupIdx(loc.groupIndex);
      setViewerStoryIdx(loc.storyIndex);
      setViewerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("story");
      setSearchParams(next, { replace: true });
    } else {
      // Loaded successfully but target absent (expired/invalid or empty feed).
      deepLinkOpenedRef.current = target;
      toast.info("Denne storyen er ikke lenger tilgjengelig");
      const next = new URLSearchParams(searchParams);
      next.delete("story");
      setSearchParams(next, { replace: true });
    }
  }, [groups, loading, error, searchParams, setSearchParams]);


  const getThumbUrl = (story: { publicUrl: string }) => story.publicUrl;

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
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
              >
                <AlertTriangle size={16} aria-hidden />
                <span className="flex-1">Kunne ikke laste historier</span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="underline underline-offset-2 font-medium"
                >
                  Prøv igjen
                </button>
              </div>
            )}
            <StoryRing
              groups={groups}
              loading={loading}
              onAddStory={() => setCaptureOpen(true)}
              onOpenStory={(idx) => openStory(idx)}
            />


            {groups.length === 0 ? (
              <BrandEmptyState
                icon={Film}
                title="Ingen historier ennå"
                description="Trykk + for å dele din første story med Gütta!"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groups.map((group, idx) => {
                  const latestStory = group.stories[group.stories.length - 1];
                  const thumbUrl = getThumbUrl(latestStory);
                  const diff = Date.now() - new Date(latestStory.createdAt).getTime();
                  const mins = Math.floor(diff / 60000);
                  const timeAgo = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}t`;

                  return (
                    <button
                      key={group.userId}
                      type="button"
                      onClick={() => openStory(idx, 0)}
                      aria-label={`Åpne historier fra ${group.displayName}`}
                      className={cn(
                        "relative aspect-[3/4] rounded-xl overflow-hidden",
                        "active:scale-[0.97] transition-transform"
                      )}
                    >
                      {latestStory.signError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground p-2">
                          <AlertTriangle size={18} aria-hidden />
                          <span className="text-[11px]">Kunne ikke laste</span>
                        </div>
                      ) : latestStory.type === "image" ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <video
                          src={thumbUrl + "#t=0.5"}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                      {group.hasUnviewed && (
                        <div
                          className="absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)" }}
                        >
                          {group.displayName[0]?.toUpperCase()}
                        </div>
                      )}

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

      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={viewerGroupIdx}
          initialStoryIndex={viewerStoryIdx}
          onClose={() => {
            setViewerOpen(false);
            refetch();
          }}
          onViewed={markViewed}
          onDelete={deleteStory}
        />
      )}

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
