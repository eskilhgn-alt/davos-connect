import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { WebcamPreloadProvider } from "@/components/webcams";
import { ShotBanOverlay } from "@/components/shot/ShotBanOverlay";

/**
 * AppLayout: App shell with bottom navigation
 * WebcamPreloadProvider starts preloading video iframes as soon as
 * user enters any app route (live, webcams, home, etc.)
 */
export const AppLayout: React.FC = () => {
  return (
    <WebcamPreloadProvider>
      <div className="h-full overflow-hidden bg-background">
        <main className="h-full min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <BottomNavigation />
        <ShotBanOverlay />
      </div>
    </WebcamPreloadProvider>
  );
};
