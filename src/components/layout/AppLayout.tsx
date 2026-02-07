import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { WebcamPreloadProvider } from "@/components/webcams";
import { WitnessOverlay } from "@/components/shot/WitnessOverlay";
import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";
import { useLocationTracker } from "@/hooks/useLocationTracker";

/**
 * AppLayout: App shell with bottom navigation
 * WitnessOverlay shows fullscreen confirmation when user is chosen as witness
 */
export const AppLayout: React.FC = () => {
  // Track user's location in the background
  useLocationTracker();

  return (
    <WebcamPreloadProvider>
      <div className="h-full overflow-hidden bg-background">
        <main className="h-full min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <BottomNavigation />
        <WitnessOverlay />
        <PermissionPrompt />
      </div>
    </WebcamPreloadProvider>
  );
};
