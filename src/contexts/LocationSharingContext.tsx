/**
 * LocationSharingContext — én delt, opt-in geolocation-provider for hele appen.
 *
 * Kontrakt:
 *  - `enabled` er alltid `false` ved oppstart av ny app-/nettleserøkt.
 *    Ingen GPS-polling starter før brukeren eksplisitt trykker
 *    «Del min posisjon» (via `startSharing`).
 *  - `startSharing()` henter først en posisjon. Deling («enabled=true»)
 *    aktiveres kun hvis geolocation faktisk lykkes. Blir tillatelsen
 *    nektet, forblir `enabled=false` og en konkret feilmelding
 *    eksponeres via `error`.
 *  - Bare én geolocation-poller og én database-upsert-loop kjører.
 *  - `stopSharing()` stopper pollere, tømmer cache og sletter egen
 *    `user_locations`-rad. Feil rapporteres via `error`.
 *  - Ved logout stoppes deling og radder ryddes så langt det er mulig.
 *  - Posisjon er TURBUNDET (Port 0c). All skriving skjer på den sammensatte
 *    identiteten `(trip_id, user_id)`. Uten valgt tur skrives ingenting.
 *  - Ved turbytte forkastes alle in-flight svar (generasjonsteller), delingen
 *    stoppes for forrige tur og raden der ryddes. Brukeren må starte deling
 *    eksplisitt igjen i den nye turen.
 *  - Provideren er montert på app-rot, IKKE i AppLayout: navigasjon til Chat
 *    (som har eget layout) skal aldri stoppe deling i det stille.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTrip } from "@/contexts/TripContext";
import { pendingFrom } from "@/integrations/supabase/pendingSchema";

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
  /**
   * Tidspunkt (ms) for den FAKTISKE geolokasjonsmålingen
   * (`GeolocationPosition.timestamp`). Settes kun ved en reell suksess.
   * Aldri `Date.now()` ved rerender av en allerede lagret posisjon.
   */
  timestamp: number;
}

interface LocationSharingContextValue {
  enabled: boolean;
  position: GeoPosition | null;
  /** Måletidspunkt for `position`, eller null når vi ikke har en fersk måling. */
  positionUpdatedAt: number | null;
  loading: boolean;
  error: string | null;
  /** Turen delingen er bundet til, eller `null` når ingen tur er valgt. */
  tripId: string | null;
  /** Returnerer `true` når deling faktisk ble aktivert. */
  startSharing: () => Promise<boolean>;
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

/** Oversetter en `GeolocationPositionError`-kode til en kort norsk melding. */
export function geoErrorMessage(code: number): string {
  switch (code) {
    case 1: // PERMISSION_DENIED
      return "Posisjonstilgang er avslått. Aktiver stedstjenester i innstillingene for å dele posisjon.";
    case 2: // POSITION_UNAVAILABLE
      return "Posisjon er ikke tilgjengelig akkurat nå. Prøv igjen når du har bedre GPS-signal.";
    case 3: // TIMEOUT
      return "Tidsavbrudd ved henting av posisjon. Prøv igjen.";
    default:
      return "Kunne ikke hente posisjon.";
  }
}

export const LocationSharingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { selectedTripId } = useTrip();
  const [enabled, setEnabled] = React.useState(false);
  const [position, setPosition] = React.useState<GeoPosition | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const geoTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const upsertTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = React.useRef<{ lat: number; lon: number; ts: number } | null>(null);
  const posRef = React.useRef<GeoPosition | null>(null);
  const userIdRef = React.useRef<string | null>(null);
  const enabledRef = React.useRef(false);
  const tripIdRef = React.useRef<string | null>(null);
  /** Monoton generasjon: hvert tur-/brukerbytte ugyldiggjør in-flight arbeid. */
  const generation = React.useRef(0);

  React.useEffect(() => {
    posRef.current = position;
  }, [position]);
  React.useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);
  React.useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  React.useEffect(() => {
    tripIdRef.current = selectedTripId;
  }, [selectedTripId]);

  const stopTimers = React.useCallback(() => {
    if (geoTimerRef.current) { clearInterval(geoTimerRef.current); geoTimerRef.current = null; }
    if (upsertTimerRef.current) { clearInterval(upsertTimerRef.current); upsertTimerRef.current = null; }
  }, []);

  /** Henter én posisjon som Promise. Feil rejecter med GeolocationPositionError. */
  const getPositionOnce = React.useCallback((): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 2, message: "Geolocation not supported" } as GeolocationPositionError);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (geo) => {
          resolve({
            lat: geo.coords.latitude,
            lon: geo.coords.longitude,
            accuracy: geo.coords.accuracy,
            altitude: geo.coords.altitude,
            altitudeAccuracy: geo.coords.altitudeAccuracy,
            speed: geo.coords.speed,
            timestamp: typeof geo.timestamp === "number" ? geo.timestamp : Date.now(),
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }, []);

  /** Bakgrunnsoppdatering brukt av pollen. Stopper deling ved PERMISSION_DENIED. */
  const pollPosition = React.useCallback(() => {
    if (!enabledRef.current) return;
    getPositionOnce()
      .then((pos) => {
        setPosition(pos);
        setError(null);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...pos, _ts: Date.now() }));
        } catch { /* */ }
      })
      .catch((err: GeolocationPositionError) => {
        console.warn("Geolocation poll error:", err?.message);
        // Ved nektet tillatelse: stopp deling helt, ikke fortsett å prompte hvert 30. sekund.
        if (err?.code === 1) {
          stopTimers();
          setEnabled(false);
          setPosition(null);
          lastSentRef.current = null;
          setError(geoErrorMessage(1));
        } else {
          setError(geoErrorMessage(err?.code ?? 0));
        }
      });
  }, [getPositionOnce, stopTimers]);

  const upsert = React.useCallback(async (force: boolean) => {
    const pos = posRef.current;
    const uid = userIdRef.current;
    const tripId = tripIdRef.current;
    // Ingen tur = ingen skriving. Turbundet identitet er ikke valgfri.
    if (!pos || !uid || !tripId) return;

    const now = Date.now();
    if (!force && lastSentRef.current) {
      const dist = haversineDistance(lastSentRef.current, pos);
      const age = now - lastSentRef.current.ts;
      if (dist < MIN_DISTANCE_M && age < UPSERT_HEARTBEAT_MS) return;
    }

    const gen = generation.current;
    const { error: upsertErr } = await pendingFrom("user_locations").upsert(
      {
        trip_id: tripId,
        user_id: uid,
        lat: pos.lat,
        lon: pos.lon,
        updated_at: new Date().toISOString(),
      },
      // Sammensatt identitet — én rad per (tur, bruker). Samme bruker kan ha
      // rader i flere turer samtidig uten å overskrive hverandre.
      { onConflict: "trip_id,user_id" }
    );
    // Et sent svar etter turbytte skal verken sette state eller «lastSent».
    if (gen !== generation.current || tripIdRef.current !== tripId) return;
    if (upsertErr) {
      console.warn("user_locations upsert error:", upsertErr.message);
      setError("Kunne ikke oppdatere posisjon i skyen");
      return;
    }
    lastSentRef.current = { lat: pos.lat, lon: pos.lon, ts: now };
  }, []);

  const clearRow = React.useCallback(async (tripId: string | null) => {
    const uid = userIdRef.current;
    if (!uid || !tripId) return;
    // Sletting er alltid smal: nøyaktig (trip_id, user_id).
    const { error: delErr } = await pendingFrom("user_locations")
      .delete()
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .then((r) => r);
    if (delErr) {
      console.warn("user_locations delete error:", delErr.message);
      setError("Kunne ikke slette posisjon");
    }
  }, []);

  const startSharing = React.useCallback(async (): Promise<boolean> => {
    if (enabledRef.current) return true;
    if (!tripIdRef.current) {
      setError("Velg en tur før du deler posisjon.");
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const pos = await getPositionOnce();
      // Rekkefølge: sett posisjon først, deretter enabled=true. Da vil
      // heartbeat-effekten under kunne kjøre en umiddelbar upsert.
      setPosition(pos);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...pos, _ts: Date.now() }));
      } catch { /* */ }
      setEnabled(true);
      setLoading(false);
      return true;
    } catch (err) {
      const code = (err as GeolocationPositionError | undefined)?.code ?? 0;
      console.warn("startSharing geolocation error:", (err as GeolocationPositionError | undefined)?.message);
      stopTimers();
      setEnabled(false);
      setPosition(null);
      lastSentRef.current = null;
      setError(geoErrorMessage(code));
      setLoading(false);
      return false;
    }
  }, [getPositionOnce, stopTimers]);

  const stopSharing = React.useCallback(async () => {
    const tripId = tripIdRef.current;
    generation.current += 1;
    stopTimers();
    setEnabled(false);
    setLoading(false);
    setPosition(null);
    lastSentRef.current = null;
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch { /* */ }
    await clearRow(tripId);
  }, [clearRow, stopTimers]);

  // Kjør geolocation-poller og upsert-heartbeat mens `enabled` er true.
  React.useEffect(() => {
    if (!enabled) {
      stopTimers();
      return;
    }
    geoTimerRef.current = setInterval(pollPosition, GEO_POLL_MS);
    // Heartbeat sjekker minst hvert 30. sekund om det er tid for upsert
    upsertTimerRef.current = setInterval(() => { void upsert(false); }, 30_000);
    return () => stopTimers();
  }, [enabled, pollPosition, upsert, stopTimers]);

  // Upsert umiddelbart første gang vi får en posisjon etter oppstart.
  React.useEffect(() => {
    if (enabled && position && !lastSentRef.current) {
      void upsert(true);
    } else if (enabled && position) {
      void upsert(false);
    }
  }, [enabled, position, upsert]);

  // Turbytte: deling er turbundet. Stopp forrige turs deling, rydd raden der
  // og forkast in-flight arbeid. Brukeren må starte eksplisitt i ny tur.
  const prevTripRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const prev = prevTripRef.current;
    prevTripRef.current = selectedTripId;
    if (prev === null || prev === selectedTripId) return;
    generation.current += 1;
    if (enabledRef.current) {
      stopTimers();
      setEnabled(false);
      setPosition(null);
      lastSentRef.current = null;
      const uid = userIdRef.current;
      if (uid) {
        void pendingFrom("user_locations")
          .delete()
          .eq("trip_id", prev)
          .eq("user_id", uid)
          .then(({ error: delErr }) => {
            if (delErr) console.warn("trip switch cleanup failed:", delErr.message);
          });
      }
    }
  }, [selectedTripId, stopTimers]);

  // Ved logout: stopp deling og rydd rad.
  const prevUserRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const curr = user?.id ?? null;
    const prev = prevUserRef.current;
    if (prev && !curr && enabled) {
      stopTimers();
      setEnabled(false);
      setPosition(null);
      lastSentRef.current = null;
      const tripAtLogout = tripIdRef.current;
      if (tripAtLogout) {
        void pendingFrom("user_locations")
          .delete()
          .eq("trip_id", tripAtLogout)
          .eq("user_id", prev)
          .then(({ error: delErr }) => {
            if (delErr) console.warn("logout cleanup failed:", delErr.message);
          });
      }
    }
    prevUserRef.current = curr;
  }, [user?.id, enabled, stopTimers]);

  const value = React.useMemo<LocationSharingContextValue>(
    () => ({
      enabled,
      position,
      // Utledet av den faktiske målingen — nullstilles automatisk når
      // posisjonen fjernes ved stopp eller feil.
      positionUpdatedAt: position ? position.timestamp : null,
      loading,
      error,
      startSharing,
      stopSharing,
      tripId: selectedTripId,
    }),
    [enabled, position, loading, error, startSharing, stopSharing, selectedTripId]
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
