import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";

/**
 * AppLayout: App shell with bottom navigation
 * Used by all routes EXCEPT chat (which has its own ChatLayout)
 */
export const AppLayout: React.FC = () => {
  return (
    <div className="h-full overflow-hidden bg-background">
      <main className="h-full min-h-0 overflow-hidden">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};
