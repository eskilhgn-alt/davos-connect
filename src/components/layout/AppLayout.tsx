import * as React from "react";
import { Outlet } from "react-router-dom";
import { FloatingHomeButton } from "./FloatingHomeButton";
import { WebcamPreloadProvider } from "@/components/webcams";
import { WitnessOverlay } from "@/components/shot/WitnessOverlay";
import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";
import { useLocationTracker } from "@/hooks/useLocationTracker";

/**
 * AppLayout: App shell with floating home button (no bottom nav bar)
 */
export const AppLayout: React.FC = () => {
  useLocationTracker();

  return (
    <WebcamPreloadProvider>
      <div className="h-full overflow-hidden bg-background">
        <main className="h-full min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <FloatingHomeButton />
        <WitnessOverlay />
        <PermissionPrompt />
      </div>
    </WebcamPreloadProvider>
  );
};
