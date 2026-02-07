/**
 * OfflineIndicator - Shows banner when user loses internet
 */

import * as React from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2",
        "bg-destructive text-destructive-foreground text-sm font-medium py-2 px-4",
        "safe-area-top"
      )}
    >
      <WifiOff className="h-4 w-4" />
      <span>Ingen internettforbindelse</span>
    </div>
  );
};
