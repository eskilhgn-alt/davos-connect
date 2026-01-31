import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { ChevronLeft } from "lucide-react";
import { PushNotificationToggle } from "@/components/settings/PushNotificationToggle";

export const NotificationsScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader 
        title="Varsler" 
        subtitle="Push-innstillinger"
        leftAction={
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-muted/50 active:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        }
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
