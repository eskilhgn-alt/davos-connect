/**
 * useLocationTracker — én delt periodisk upsert av brukerens GPS-posisjon.
 *
 * Kontrakt (step 3):
 *  - Aktiveres KUN når kalleren eksplisitt slår det på (typisk /crew).
 *  - AppLayout skal ikke lenger kalle denne hooken automatisk.
 *  - `stopSharing()` sletter brukerens rad i `user_locations` slik at ingen
 *    andre klienter ser en foreldet posisjon som fersk.
 */
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAuth } from "@/contexts/AuthContext";

const UPDATE_INTERVAL = 30_000; // 30 seconds
const MIN_DISTANCE_M = 25;

function haversineDistance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Slett brukerens egen posisjonsrad. RLS tillater kun sletting av egen rad.
 */
export async function clearMyLocation(userId: string) {
  await supabase.from("user_locations").delete().eq("user_id", userId);
}

export function useLocationTracker() {
  const { user } = useAuth();
  const { position, enabled, request, disable } = useGeolocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const posRef = useRef(position);
  const lastSentRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    posRef.current = position;
  }, [position]);

  const upsert = useCallback(async () => {
    const pos = posRef.current;
    if (!user || !pos) return;

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
    upsert();
    intervalRef.current = setInterval(upsert, UPDATE_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, enabled, position, upsert]);

  const startSharing = useCallback(() => {
    request();
  }, [request]);

  const stopSharing = useCallback(async () => {
    disable();
    if (intervalRef.current) clearInterval(intervalRef.current);
    lastSentRef.current = null;
    if (user) await clearMyLocation(user.id);
  }, [disable, user]);

  return { enabled, position, startSharing, stopSharing };
}
