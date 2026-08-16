/**
 * useUserLocations — abonnerer på brukerposisjoner for ÉN tur i sanntid.
 *
 * Kontrakt (Port 0c):
 *  - Posisjoner er turbundet. Uten `tripId` leses ingenting og listen er tom.
 *  - Lesing filtreres på `trip_id`, og Realtime-abonnementet er SERVER-filtrert
 *    på samme `trip_id` (ikke bare klientside).
 *  - Alle asynkrone callbacks forkastes hvis turen er byttet i mellomtiden
 *    (generasjonsteller + tur-id-sjekk), slik at tur A aldri lekker inn i B.
 *  - Foreldede posisjoner (> STALE_LOCATION_MS) filtreres bort, og en lokal
 *    timer revurderer listen hvert minutt.
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
  trip_id: string;
  lat: number;
  lon: number;
  updated_at: string;
  display_name?: string;
  avatar_url?: string;
}

interface RawLocation {
  user_id: string;
  trip_id: string | null;
  lat: number;
  lon: number;
  updated_at: string;
}

interface ProfileMini {
  name: string;
  avatar?: string | null;
}

/**
 * Ren, testbar regel: en rad hører til visningen bare når den gjelder
 * NØYAKTIG valgt tur. Legacy-rader uten `trip_id` vises aldri.
 */
export function belongsToTrip(
  row: { trip_id?: string | null },
  tripId: string | null | undefined,
): boolean {
  if (!tripId) return false;
  return !!row.trip_id && row.trip_id === tripId;
}

export function useUserLocations(tripId: string | null) {
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const rawRef = useRef<RawLocation[]>([]);
  const profileMapRef = useRef<Map<string, ProfileMini>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // Generasjon: hvert tur-bytte ugyldiggjør alle in-flight svar.
    const myTrip = tripId;

    // Turbytte skal aldri vise forrige turs posisjoner et øyeblikk.
    rawRef.current = [];
    profileMapRef.current = new Map();
    setLocations([]);

    if (!myTrip) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);

    const applyFilter = () => {
      const now = Date.now();
      const map = profileMapRef.current;
      setLocations(
        rawRef.current
          .filter((d) => belongsToTrip(d, myTrip) && isFreshLocation(d.updated_at, now))
          .map((d) => ({
            user_id: d.user_id,
            trip_id: myTrip,
            lat: d.lat,
            lon: d.lon,
            updated_at: d.updated_at,
            display_name: map.get(d.user_id)?.name || "Ukjent",
            avatar_url: map.get(d.user_id)?.avatar || undefined,
          })),
      );
    };

    const fetchAll = async () => {
      const { data } = await pendingFrom("user_locations")
        .select("user_id, trip_id, lat, lon, updated_at")
        .eq("trip_id", myTrip)
        .then((r) => r);
      // Forkast svar som kom etter unmount eller turbytte.
      if (cancelled) return;
      const raw = ((data as RawLocation[] | null) ?? []).filter((d) => belongsToTrip(d, myTrip));

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
          ]),
        );
      }

      applyFilter();
      setLoading(false);
    };

    void fetchAll();

    const channel = supabase
      .channel(`user-locations-realtime:${myTrip}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_locations",
          // SERVER-filter: vi mottar aldri events for andre turer.
          filter: `trip_id=eq.${myTrip}`,
        },
        () => {
          if (cancelled) return;
          void fetchAll();
        },
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
  }, [tripId]);

  return { locations, loading };
}
