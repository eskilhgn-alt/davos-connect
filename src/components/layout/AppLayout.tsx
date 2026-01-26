import * as React from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";

export const AppLayout: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};
