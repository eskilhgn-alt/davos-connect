/**
 * useUserLocations — abonnerer på alle brukerposisjoner i sanntid.
 * Filtrerer bort foreldede posisjoner (> STALE_LOCATION_MS) slik at inaktive
 * brukere aldri fremstår som «her nå». En lokal timer revurderer listen
 * hvert minutt så en posisjon forsvinner når den faktisk blir stale, selv om
 * ingen realtime-event kommer.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const STALE_LOCATION_MS = 10 * 60 * 1000; // 10 min
const REEVALUATE_INTERVAL_MS = 60_000; // 1 min

/**
 * Delt "er posisjonen fersk?"-helper. Brukes både i produksjonsfiltrering og
 * i tester slik at én sannhet håndhever regelen.
 */
export function isFreshLocation(updatedAt: string, now: number = Date.now()): boolean {
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < STALE_LOCATION_MS;
}

export interface UserLocation {
  user_id: string;
  lat: number;
  lon: number;
  updated_at: string;
  display_name?: string;
  avatar_url?: string;
}

interface RawLocation {
  user_id: string;
  lat: number;
  lon: number;
  updated_at: string;
}

interface ProfileMini {
  name: string;
  avatar?: string | null;
}

export function useUserLocations() {
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const rawRef = useRef<RawLocation[]>([]);
  const profileMapRef = useRef<Map<string, ProfileMini>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const applyFilter = () => {
      const now = Date.now();
      const map = profileMapRef.current;
      setLocations(
        rawRef.current
          .filter((d) => isFreshLocation(d.updated_at, now))
          .map((d) => ({
            ...d,
            display_name: map.get(d.user_id)?.name || "Ukjent",
            avatar_url: map.get(d.user_id)?.avatar || undefined,
          }))
      );
    };

    const fetchAll = async () => {
      const { data } = await supabase
        .from("user_locations")
        .select("user_id, lat, lon, updated_at");
      if (cancelled) return;
      const raw = (data as RawLocation[] | null) ?? [];
      rawRef.current = raw;

      if (raw.length > 0) {
        const userIds = raw.map((d) => d.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url")
          .in("id", userIds);
        if (cancelled) return;
        profileMapRef.current = new Map(
          (profiles || []).map((p) => [
            p.id,
            { name: p.nickname || p.full_name || "Ukjent", avatar: p.avatar_url },
          ])
        );
      }

      applyFilter();
      setLoading(false);
    };

    fetchAll();

    const channel = supabase
      .channel("user-locations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        () => { fetchAll(); }
      )
      .subscribe();

    // Revurdér lokalt hvert minutt slik at stale-filteret ikke er avhengig
    // av at en realtime-event trigger.
    const interval = setInterval(applyFilter, REEVALUATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return { locations, loading };
}
