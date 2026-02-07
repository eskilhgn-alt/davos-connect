/**
 * StoriesScreen - Main stories page with rings and add button
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { StoryCapture } from "@/components/stories/StoryCapture";
import { useStories } from "@/hooks/useStories";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Film, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Historier"
        subtitle="Delt av crewet"
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
          <div className="p-4 space-y-6">
            {/* Story rings row */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              {/* Add story button */}
              <button
                type="button"
                onClick={() => setCaptureOpen(true)}
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className={cn(
                  "w-16 h-16 rounded-full border-2 border-dashed border-primary",
                  "flex items-center justify-center",
                  "active:scale-95 transition-transform"
                )}>
                  <Plus size={24} className="text-primary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Ny story</span>
              </button>

              {/* User story rings */}
              {groups.map((group, idx) => (
                <button
                  key={group.userId}
                  type="button"
                  onClick={() => openStory(idx)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0"
                >
                  <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center",
                    "text-white text-lg font-bold",
                    group.hasUnviewed
                      ? "bg-gradient-to-br from-primary to-accent ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "bg-muted text-muted-foreground ring-2 ring-border ring-offset-1 ring-offset-background"
                  )}>
                    {group.displayName[0]?.toUpperCase()}
                  </div>
                  <span className={cn(
                    "text-xs font-medium max-w-[64px] truncate",
                    group.hasUnviewed ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {group.userId === user?.id ? "Din" : group.displayName.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>

            {/* Stories feed - visual grid */}
            {groups.length === 0 ? (
              <DavosEmptyState
                icon={Film}
                title="Ingen historier ennå"
                description="Trykk + for å dele din første story med crewet!"
              />
            ) : (
              <div className="space-y-4">
                {groups.map((group, idx) => (
                  <button
                    key={group.userId}
                    type="button"
                    onClick={() => openStory(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl",
                      "bg-muted/50 border border-border",
                      "active:scale-[0.98] transition-transform text-left"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center",
                      "text-white font-bold",
                      group.hasUnviewed
                        ? "bg-gradient-to-br from-primary to-accent"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {group.displayName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{group.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.stories.length} {group.stories.length === 1 ? "story" : "stories"} · {(() => {
                          const latest = group.stories[group.stories.length - 1];
                          const diff = Date.now() - new Date(latest.createdAt).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 60) return `${mins}m siden`;
                          return `${Math.floor(mins / 60)}t siden`;
                        })()}
                      </p>
                    </div>
                    {group.hasUnviewed && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
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
          onClose={() => { setViewerOpen(false); refetch(); }}
          onViewed={markViewed}
        />
      )}

      {/* Story Capture */}
      {captureOpen && (
        <StoryCapture
          onClose={() => setCaptureOpen(false)}
          onPublished={() => { setCaptureOpen(false); refetch(); }}
        />
      )}
    </div>
  );
};

export default StoriesScreen;
