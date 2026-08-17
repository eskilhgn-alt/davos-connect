/**
 * useUserLocations — abonnerer på brukerposisjoner for ÉN tur i sanntid.
 *
 * Kontrakt (Port 0c):
 *  - Posisjoner er turbundet. Uten `tripId` leses ingenting og listen er tom.
 *  - Lesing filtreres på `trip_id`, og Realtime-abonnementene er SERVER-filtrert
 *    på samme `trip_id`.
 *  - DELETE kan IKKE filtreres i Supabase Realtime, og med RLS er `old_record`
 *    begrenset til primærnøkler. Vi abonnerer derfor bevisst KUN på filtrerte
 *    INSERT/UPDATE, og fanger slettinger med en turfiltrert reparasjons-refetch
 *    (fast intervall, ved SUBSCRIBED/reconnect, `online` og når appen kommer i
 *    forgrunnen). Ingen ufiltrert kanal på tvers av turer.
 *  - Samtidige refetcher dedupliseres, og alle svar forkastes hvis turen er
 *    byttet eller hooken er unmountet i mellomtiden.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { targetDb, type TargetUserLocationRow } from "@/integrations/supabase/targetSchema";

export const STALE_LOCATION_MS = 10 * 60 * 1000; // 10 min
const REEVALUATE_INTERVAL_MS = 60_000; // 1 min — lokal stale-revurdering
export const REPAIR_REFETCH_INTERVAL_MS = 60_000; // 1 min — fanger DELETE

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

type RawLocation = Pick<TargetUserLocationRow, "user_id" | "trip_id" | "lat" | "lon" | "updated_at">;

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

/**
 * Ren reparasjonsregel: resultatet av en refetch er AUTORITATIVT for turen.
 * Rader som ikke lenger finnes i svaret (slettet mens vi ikke fikk DELETE-event)
 * forsvinner, og rader fra andre turer slipper aldri gjennom.
 */
export function reconcileLocations(
  rows: { user_id: string; trip_id?: string | null; updated_at: string }[],
  tripId: string | null,
  now: number = Date.now(),
): string[] {
  if (!tripId) return [];
  return rows
    .filter((r) => belongsToTrip(r, tripId) && isFreshLocation(r.updated_at, now))
    .map((r) => r.user_id);
}

export function useUserLocations(tripId: string | null) {
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const rawRef = useRef<RawLocation[]>([]);
  const profileMapRef = useRef<Map<string, ProfileMini>>(new Map());

  useEffect(() => {
    let cancelled = false;
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

    // Dedup: én refetch om gangen. Nye forespørsler mens en er underveis
    // markerer at vi må kjøre én gang til etterpå.
    let inFlight: Promise<void> | null = null;
    let queued = false;

    const doFetch = async () => {
      const { data } = await targetDb
        .from("user_locations")
        .select("user_id, trip_id, lat, lon, updated_at")
        .eq("trip_id", myTrip);
      // Forkast svar som kom etter unmount eller turbytte.
      if (cancelled) return;
      const raw = ((data as RawLocation[] | null) ?? []).filter((d) => belongsToTrip(d, myTrip));

      // Autoritativt: rader som forsvant (DELETE vi aldri fikk event for)
      // fjernes fordi vi erstatter hele settet.
      rawRef.current = raw;

      const unknownIds = raw.map((d) => d.user_id).filter((id) => !profileMapRef.current.has(id));
      if (unknownIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url")
          .in("id", unknownIds);
        if (cancelled) return;
        const next = new Map(profileMapRef.current);
        (profiles || []).forEach((p) => {
          next.set(p.id, { name: p.nickname || p.full_name || "Ukjent", avatar: p.avatar_url });
        });
        profileMapRef.current = next;
      }

      applyFilter();
      setLoading(false);
    };

    const refetch = (): Promise<void> => {
      if (inFlight) {
        queued = true;
        return inFlight;
      }
      inFlight = doFetch()
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
          if (queued && !cancelled) {
            queued = false;
            void refetch();
          }
        });
      return inFlight;
    };

    void refetch();

    // Realtime: KUN turfiltrerte INSERT/UPDATE. DELETE kan ikke filtreres.
    const channel = supabase
      .channel(`user-locations-realtime:${myTrip}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_locations",
          filter: `trip_id=eq.${myTrip}`,
        },
        () => {
          if (!cancelled) void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_locations",
          filter: `trip_id=eq.${myTrip}`,
        },
        () => {
          if (!cancelled) void refetch();
        },
      )
      .subscribe((status) => {
        // Ved første tilkobling OG ved hver reconnect: reparer settet.
        if (status === "SUBSCRIBED" && !cancelled) void refetch();
      });

    // Reparasjonsveier for slettinger vi aldri får event for.
    const repairTimer = setInterval(() => {
      if (!cancelled) void refetch();
    }, REPAIR_REFETCH_INTERVAL_MS);

    const onOnline = () => {
      if (!cancelled) void refetch();
    };
    const onVisible = () => {
      if (!cancelled && document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    // Revurdér stale-filteret lokalt uavhengig av nettverk.
    const interval = setInterval(applyFilter, REEVALUATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(repairTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  return { locations, loading };
}
