import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BottomNavigation } from "./BottomNavigation";

import { PopupAnnouncementOverlay } from "./PopupAnnouncement";
import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";
import { LocationSharingProvider } from "@/contexts/LocationSharingContext";

/**
 * AppLayout: App shell med 4-fane nav (Hjem / Chat / Kart / Mer).
 * Chat har eget layout — nav skjules der.
 *
 * MERK (step 3+QA): Layoutet starter ikke lenger location-tracker eller
 * automatiske pushjobber. Posisjonsdeling er strengt opt-in og styres av
 * `LocationSharingProvider`, som monteres én gang her slik at en aktiv
 * deling overlever navigasjon mellom faner.
 */
export const AppLayout: React.FC = () => {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/chat");

  return (
    <LocationSharingProvider>
      <div className="h-full overflow-hidden bg-background flex flex-col">
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
        {!hideNav && <BottomNavigation />}
        <PermissionPrompt />
        <PopupAnnouncementOverlay />
      </div>
    </LocationSharingProvider>
  );
};
