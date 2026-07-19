import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";

import { PopupAnnouncementOverlay } from "./PopupAnnouncement";
import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";

/**
 * AppLayout: App shell with 4-tab bottom nav (Hjem / Chat / Kart / Mer).
 * Chat has its own dedicated layout — nav is hidden there.
 *
 * MERK (step 3): Layoutet starter ikke lenger location-tracker eller
 * automatiske pushjobber automatisk. Posisjonsdeling er strengt opt-in og
 * aktiveres kun fra `/crew`. Push-registrering skjer via `PermissionPrompt`
 * etter eksplisitt brukerhandling.
 */
export const AppLayout: React.FC = () => {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/chat");

  return (
    <div className="h-full overflow-hidden bg-background flex flex-col">
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
      {!hideNav && <BottomNavigation />}
      <PermissionPrompt />
      <PopupAnnouncementOverlay />
    </div>
  );
};
