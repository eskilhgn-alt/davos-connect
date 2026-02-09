/**
 * useLocationTracker — periodically upserts user's GPS position to user_locations table
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";

const UPDATE_INTERVAL = 10_000; // 10 seconds – frequent tracking

export function useLocationTracker() {
  const { user } = useAuth();
  const { position, enabled } = useGeolocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!user || !enabled || !position) return;

    const upsert = async () => {
      await supabase.from("user_locations").upsert(
        {
          user_id: user.id,
          lat: position.lat,
          lon: position.lon,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    };

    // Immediate upsert
    upsert();

    // Periodic updates
    intervalRef.current = setInterval(upsert, UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, enabled, position]);
}
