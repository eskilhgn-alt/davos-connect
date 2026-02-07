import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PushNotificationToggle } from "@/components/settings/PushNotificationToggle";

export const NotificationsScreen: React.FC = () => {
  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader 
        title="Varsler" 
        subtitle="Push-innstillinger"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />
      
      <div 
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <PushNotificationToggle />
      </div>
    </div>
  );
};

export default NotificationsScreen;
