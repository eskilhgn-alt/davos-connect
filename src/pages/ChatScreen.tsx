import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosListRowSkeleton } from "@/components/ui/davos-skeleton";
import { MessageCircle } from "lucide-react";

type ScreenState = "empty" | "loading" | "error";

export const ChatScreen: React.FC = () => {
  const [state] = React.useState<ScreenState>("empty");

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader title="Chat" subtitle="Davos Crew" />
      
      <div className="flex-1 flex items-center justify-center">
        {state === "loading" && (
          <div className="w-full">
            {Array.from({ length: 5 }).map((_, i) => (
              <DavosListRowSkeleton key={i} />
            ))}
          </div>
        )}
        
        {state === "error" && (
          <DavosErrorState 
            onRetry={() => {}} 
          />
        )}
        
        {state === "empty" && (
          <DavosEmptyState
            icon={MessageCircle}
            title="Ingen samtaler ennå"
            description="Chatten aktiveres når gjengen kobles sammen."
          />
        )}
      </div>
    </div>
  );
};

export default ChatScreen;
