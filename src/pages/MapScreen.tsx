import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Map } from "lucide-react";

type ScreenState = "empty" | "loading" | "error";

export const MapScreen: React.FC = () => {
  const [state] = React.useState<ScreenState>("empty");

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader title="Kart" subtitle="Davos Klosters" />
      
      <div className="flex-1 flex items-center justify-center">
        {state === "loading" && (
          <div className="w-full h-full p-4">
            <DavosSkeleton variant="rectangular" className="w-full h-64" />
            <div className="mt-4 space-y-3">
              <DavosSkeleton variant="text" className="w-2/3" />
              <DavosSkeleton variant="text" className="w-1/2" />
            </div>
          </div>
        )}
        
        {state === "error" && (
          <DavosErrorState 
            title="Kartet kunne ikke lastes"
            description="Sjekk nettverkstilkoblingen og prøv igjen."
            onRetry={() => {}} 
          />
        )}
        
        {state === "empty" && (
          <DavosEmptyState
            icon={Map}
            title="Kart kommer snart"
            description="Her vil du se gruppen på kartet i sanntid."
          />
        )}
      </div>
    </div>
  );
};

export default MapScreen;
