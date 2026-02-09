/**
 * useSkiTracker — automatically records vertical meters when skiing criteria are met:
 * - Altitude > 1560m (above Davos Platz)
 * - Speed > 15 km/h (4.17 m/s)
 * Runs in background when geolocation is enabled.
 */
import { useEffect, useRef } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const MIN_ALTITUDE = 1560; // meters
const MIN_SPEED = 2.78; // m/s (~10 km/h)
const RECORD_INTERVAL = 15_000; // 15 seconds

export function useSkiTracker() {
  const { user } = useAuth();
  const { position, enabled } = useGeolocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const lastRecordRef = useRef<number>(0);

  useEffect(() => {
    if (!user || !enabled || !position) return;

    const record = async () => {
      const { altitude, speed } = position;

      // Skip if no altitude or speed data
      if (altitude == null || speed == null) return;

      // Skip if criteria not met
      if (altitude < MIN_ALTITUDE || speed < MIN_SPEED) return;

      // Throttle: don't record more than once per interval
      const now = Date.now();
      if (now - lastRecordRef.current < RECORD_INTERVAL - 1000) return;
      lastRecordRef.current = now;

      await supabase.rpc("rpc_record_ski_sample", {
        p_altitude: altitude,
        p_speed: speed,
        p_lat: position.lat,
        p_lon: position.lon,
      });
    };

    record();
    intervalRef.current = setInterval(record, RECORD_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, enabled, position]);
}
