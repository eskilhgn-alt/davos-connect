import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosCardSkeleton } from "@/components/ui/davos-skeleton";
import { DavosCard } from "@/components/ui/davos-card";
import { Newspaper } from "lucide-react";

type ScreenState = "empty" | "loading" | "error";

export const FeedScreen: React.FC = () => {
  const [state] = React.useState<ScreenState>("empty");

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Feed" subtitle="Bilder & oppdateringer" />
      
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {state === "loading" && (
          <div className="w-full p-4 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <DavosCard key={i}>
                <DavosCardSkeleton />
              </DavosCard>
            ))}
          </div>
        )}
        
        {state === "error" && (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosErrorState 
              title="Feeden kunne ikke lastes"
              description="Noe gikk galt ved lasting av innholdet."
              onRetry={() => {}} 
            />
          </div>
        )}
        
        {state === "empty" && (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosEmptyState
              icon={Newspaper}
              title="Ingen oppdateringer ennå"
              description="Del bilder og øyeblikk fra turen her."
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedScreen;
