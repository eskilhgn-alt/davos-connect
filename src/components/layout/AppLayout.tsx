import * as React from "react";
import { Outlet } from "react-router-dom";

import { PopupAnnouncementOverlay } from "./PopupAnnouncement";
import { PermissionPrompt } from "@/components/onboarding/PermissionPrompt";

/**
 * Hjem samler flisene; alle undersider har hjem-pil i toppfeltet.
 * Ingen fast bunnmeny. Chat har eget layout.
 *
 * MERK (step 3+QA): Layoutet starter ikke lenger location-tracker eller
 * automatiske pushjobber. Posisjonsdeling er strengt opt-in og styres av
 * `LocationSharingProvider`, som monteres på APP-ROT (App.tsx) slik at en
 * aktiv deling overlever navigasjon mellom faner — inkludert Chat, som har
 * eget layout utenfor dette treet.
 */
export const AppLayout: React.FC = () => {
  return (
    <div className="h-full overflow-hidden bg-background flex flex-col">
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
        <PermissionPrompt />
        <PopupAnnouncementOverlay />
    </div>
  );
};
