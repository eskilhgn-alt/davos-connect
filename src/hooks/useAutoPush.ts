/**
 * useAutoPush — Automatically initializes OneSignal on app load
 * if the user previously enabled push notifications.
 * This ensures push works without requiring the user to visit ChatScreen first.
 */
import { useEffect, useRef } from "react";
import { oneSignalService } from "@/services/onesignal";
import { useAuth } from "@/contexts/AuthContext";

export function useAutoPush() {
  const { user, profile } = useAuth();
  const initRef = useRef(false);

  useEffect(() => {
    if (!user || initRef.current) return;

    const isPWA = oneSignalService.isStandalonePWA();
    const isSupported = oneSignalService.isPushSupported();
    const wasEnabled = oneSignalService.isPushEnabled();

    if (!isPWA || !isSupported || !wasEnabled) return;

    initRef.current = true;

    (async () => {
      try {
        await oneSignalService.init(user.id);

        // Re-sync push token in case it changed (e.g. after app reinstall)
        const displayName = profile?.nickname || profile?.full_name || "Ukjent";
        await oneSignalService.enablePush(user.id, displayName);
      } catch (err) {
        console.warn("[useAutoPush] Failed to auto-init push:", err);
      }
    })();
  }, [user, profile]);
}
