/**
 * useLocationTracker — periodically upserts user's GPS position to user_locations table
 * Also requests fresh GPS position each cycle for accurate tracking
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";

const UPDATE_INTERVAL = 10_000; // 10 seconds

export function useLocationTracker() {
  const { user } = useAuth();
  const { position, enabled, request } = useGeolocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const posRef = useRef(position);

  // Keep ref in sync
  useEffect(() => { posRef.current = position; }, [position]);

  const upsert = useCallback(async () => {
    const pos = posRef.current;
    if (!user || !pos) return;
    await supabase.from("user_locations").upsert(
      {
        user_id: user.id,
        lat: pos.lat,
        lon: pos.lon,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }, [user]);

  useEffect(() => {
    if (!user || !enabled || !position) return;

    // Immediate upsert
    upsert();

    // Periodic updates
    intervalRef.current = setInterval(upsert, UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, enabled, position, upsert]);

  // Also listen for visibility change to refresh location when user returns to app
  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && enabled) {
        // Re-request fresh position when app becomes visible
        request();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, request]);
}
