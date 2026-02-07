import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { WebcamPreloadProvider } from "@/components/webcams";
import { WitnessOverlay } from "@/components/shot/WitnessOverlay";

/**
 * AppLayout: App shell with bottom navigation
 * WitnessOverlay shows fullscreen confirmation when user is chosen as witness
 */
export const AppLayout: React.FC = () => {
  return (
    <WebcamPreloadProvider>
      <div className="h-full overflow-hidden bg-background">
        <main className="h-full min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <BottomNavigation />
        <WitnessOverlay />
      </div>
    </WebcamPreloadProvider>
  );
};
