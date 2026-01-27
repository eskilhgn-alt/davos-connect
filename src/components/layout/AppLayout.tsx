import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";
import { useVisualViewportVars } from "@/hooks/useVisualViewportVars";

export const AppLayout: React.FC = () => {
  // Initialize visual viewport CSS variables for keyboard handling
  useVisualViewportVars();

  return (
    <div className="min-h-screen bg-background">
      <main className="flex-1">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};
