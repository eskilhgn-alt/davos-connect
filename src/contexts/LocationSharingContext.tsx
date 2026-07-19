/**
 * LocationSharingContext — én delt, opt-in geolocation-provider for hele appen.
 *
 * Kontrakt:
 *  - `enabled` er alltid `false` ved oppstart av ny app-/nettleserøkt.
 *    Ingen GPS-polling starter før brukeren eksplisitt trykker
 *    «Del min posisjon» (via `startSharing`).
 *  - Provideren skal monteres i det autentiserte app-skallet (AppLayout).
 *    Dermed kan deling fortsette mens brukeren navigerer.
 *  - Bare én geolocation-poller og én database-upsert-loop kjører.
 *  - `stopSharing()` stopper pollere, tømmer cache og sletter egen
 *    `user_locations`-rad. Feil rapporteres via `error`.
 *  - Ved logout stoppes deling og radder ryddes så langt det er mulig.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CACHE_KEY = "geo-position";
const GEO_POLL_MS = 30_000;
const UPSERT_HEARTBEAT_MS = 2 * 60_000; // 2 min – hindrer stale-filter når brukeren står stille
const MIN_DISTANCE_M = 25;

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  speed?: number | null;
}

interface LocationSharingContextValue {
  enabled: boolean;
  position: GeoPosition | null;
  loading: boolean;
  error: string | null;
  startSharing: () => void;
  stopSharing: () => Promise<void>;
}

const LocationSharingContext = React.createContext<LocationSharingContextValue | undefined>(undefined);

function haversineDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export const LocationSharingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [enabled, setEnabled] = React.useState(false);
  const [position, setPosition] = React.useState<GeoPosition | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const geoTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const upsertTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = React.useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const posRef = React.useRef<GeoPosition | null>(null);
  const userIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    posRef.current = position;
  }, [position]);
  React.useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  const fetchPosition = React.useCallback(() => {
    if (!navigator.geolocation) {
      setError("Posisjon støttes ikke i denne nettleseren");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const pos: GeoPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
          altitude: geo.coords.altitude,
          altitudeAccuracy: geo.coords.altitudeAccuracy,
          speed: geo.coords.speed,
        };
        setPosition(pos);
        setError(null);
        setLoading(false);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...pos, _ts: Date.now() }));
        } catch { /* */ }
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setError("Kunne ikke hente posisjon");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const upsert = React.useCallback(async (force: boolean) => {
    const pos = posRef.current;
    const uid = userIdRef.current;
    if (!pos || !uid) return;

    const now = Date.now();
    if (!force && lastSentRef.current) {
      const dist = haversineDistance(lastSentRef.current, pos);
      const age = now - lastSentRef.current.ts;
      // Send hvis vi har beveget oss nok, eller det er lenge siden forrige upsert
      if (dist < MIN_DISTANCE_M && age < UPSERT_HEARTBEAT_MS) return;
    }

    const { error: upsertErr } = await supabase.from("user_locations").upsert(
      {
        user_id: uid,
        lat: pos.lat,
        lon: pos.lon,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (upsertErr) {
      console.warn("user_locations upsert error:", upsertErr.message);
      setError("Kunne ikke oppdatere posisjon i skyen");
      return;
    }
    lastSentRef.current = { lat: pos.lat, lon: pos.lon, ts: now };
  }, []);

  const clearRow = React.useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const { error: delErr } = await supabase.from("user_locations").delete().eq("user_id", uid);
    if (delErr) {
      console.warn("user_locations delete error:", delErr.message);
      setError("Kunne ikke slette posisjon");
    }
  }, []);

  const stopTimers = React.useCallback(() => {
    if (geoTimerRef.current) { clearInterval(geoTimerRef.current); geoTimerRef.current = null; }
    if (upsertTimerRef.current) { clearInterval(upsertTimerRef.current); upsertTimerRef.current = null; }
  }, []);

  const startSharing = React.useCallback(() => {
    if (enabled) return;
    setError(null);
    setLoading(true);
    setEnabled(true);
    fetchPosition();
  }, [enabled, fetchPosition]);

  const stopSharing = React.useCallback(async () => {
    stopTimers();
    setEnabled(false);
    setLoading(false);
    setPosition(null);
    lastSentRef.current = null;
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch { /* */ }
    await clearRow();
  }, [clearRow, stopTimers]);

  // Kjør geolocation-poller og upsert-heartbeat mens `enabled` er true.
  React.useEffect(() => {
    if (!enabled) {
      stopTimers();
      return;
    }
    geoTimerRef.current = setInterval(fetchPosition, GEO_POLL_MS);
    // Heartbeat sjekker minst hvert 30. sekund om det er tid for upsert
    upsertTimerRef.current = setInterval(() => { void upsert(false); }, 30_000);
    return () => stopTimers();
  }, [enabled, fetchPosition, upsert, stopTimers]);

  // Upsert umiddelbart første gang vi får en posisjon etter oppstart.
  React.useEffect(() => {
    if (enabled && position && !lastSentRef.current) {
      void upsert(true);
    } else if (enabled && position) {
      void upsert(false);
    }
  }, [enabled, position, upsert]);

  // Ved logout: stopp deling og rydd rad.
  const prevUserRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const curr = user?.id ?? null;
    const prev = prevUserRef.current;
    if (prev && !curr && enabled) {
      // Bruker logget ut; rydd
      stopTimers();
      setEnabled(false);
      setPosition(null);
      lastSentRef.current = null;
      // clearRow bruker userIdRef, som nå er null. Prøv å slette basert på prev.
      supabase.from("user_locations").delete().eq("user_id", prev).then(({ error: delErr }) => {
        if (delErr) console.warn("logout cleanup failed:", delErr.message);
      });
    }
    prevUserRef.current = curr;
  }, [user?.id, enabled, stopTimers]);

  const value = React.useMemo<LocationSharingContextValue>(
    () => ({ enabled, position, loading, error, startSharing, stopSharing }),
    [enabled, position, loading, error, startSharing, stopSharing]
  );

  return <LocationSharingContext.Provider value={value}>{children}</LocationSharingContext.Provider>;
};

export function useLocationSharing(): LocationSharingContextValue {
  const ctx = React.useContext(LocationSharingContext);
  if (!ctx) {
    throw new Error("useLocationSharing must be used within a LocationSharingProvider");
  }
  return ctx;
}
