/**
 * useLocationTracker — periodically upserts user's GPS position to user_locations table
 * Also requests fresh GPS position each cycle for accurate tracking
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";

const UPDATE_INTERVAL = 30_000; // 30 seconds
const MIN_DISTANCE_M = 25; // minimum 25m change before upsert

function haversineDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function useLocationTracker() {
  const { user } = useAuth();
  const { position, enabled, request } = useGeolocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const posRef = useRef(position);
  const lastSentRef = useRef<{ lat: number; lon: number } | null>(null);

  // Keep ref in sync
  useEffect(() => { posRef.current = position; }, [position]);

  const upsert = useCallback(async () => {
    const pos = posRef.current;
    if (!user || !pos) return;

    // Skip if position hasn't changed enough
    if (lastSentRef.current) {
      const dist = haversineDistance(lastSentRef.current, pos);
      if (dist < MIN_DISTANCE_M) return;
    }

    await supabase.from("user_locations").upsert(
      {
        user_id: user.id,
        lat: pos.lat,
        lon: pos.lon,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    lastSentRef.current = { lat: pos.lat, lon: pos.lon };
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
