/**
 * Auto-logout after idle timeout (30 min).
 * Listens for user activity and resets timer on interaction.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const useIdleLogout = (isAuthenticated: boolean) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    console.warn("[Security] Idle timeout – logging out");
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isAuthenticated) {
      timerRef.current = setTimeout(logout, IDLE_TIMEOUT_MS);
    }
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [isAuthenticated, resetTimer]);
};
