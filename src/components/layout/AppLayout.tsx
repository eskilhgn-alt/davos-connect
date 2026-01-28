import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { useVisualViewport } from "@/hooks/useVisualViewport";

/**
 * AppLayout: Thin app-shell for PWA.
 * - Initializes VisualViewport tracking for keyboard handling
 * - Provides bottom navigation
 * - Individual screens control their own scroll/layout
 */
export const AppLayout: React.FC = () => {
  // Initialize visual viewport CSS variables for keyboard handling
  useVisualViewport();

  return (
    <div className="h-full overflow-hidden bg-background">
      <main className="h-full min-h-0 overflow-hidden">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};
