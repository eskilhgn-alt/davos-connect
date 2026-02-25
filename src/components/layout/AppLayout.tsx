import * as React from "react";
import { Outlet } from "react-router-dom";
import { FloatingHomeButton } from "./FloatingHomeButton";

import { PopupAnnouncementOverlay } from "./PopupAnnouncement";
import { WebcamPreloadProvider } from "@/components/webcams";

import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";
import { useLocationTracker } from "@/hooks/useLocationTracker";
import { useAutoPush } from "@/hooks/useAutoPush";

/**
 * AppLayout: App shell with floating home button (no bottom nav bar)
 */
export const AppLayout: React.FC = () => {
  useLocationTracker();
  useAutoPush();

  return (
    <WebcamPreloadProvider>
      <div className="h-full overflow-hidden bg-background flex flex-col">
        
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <FloatingHomeButton />
        
        <PermissionPrompt />
        <PopupAnnouncementOverlay />
      </div>
    </WebcamPreloadProvider>
  );
};
