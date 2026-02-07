/**
 * useGeolocation — returns the user's GPS position with high accuracy
 * Uses watchPosition for continuous updates
 */
import { useState, useEffect, useCallback, useRef } from "react";

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy?: number;
}

const CACHE_KEY = "geo-position";
const CACHE_TTL = 5 * 60 * 1000;

function getCached(): GeoPosition | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed._ts > CACHE_TTL) return null;
    return { lat: parsed.lat, lon: parsed.lon, accuracy: parsed.accuracy };
  } catch {
    return null;
  }
}

function setCache(pos: GeoPosition) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...pos, _ts: Date.now() }));
  } catch { /* */ }
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(() => getCached());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("geo-enabled") === "true"; } catch { return false; }
  });
  const watchIdRef = useRef<number | null>(null);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Posisjon støttes ikke");
      return;
    }
    setLoading(true);
    setError(null);

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (geo) => {
        const pos: GeoPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
        setPosition(pos);
        setCache(pos);
        setLoading(false);
        setEnabled(true);
        try { localStorage.setItem("geo-enabled", "true"); } catch { /* */ }
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setError("Kunne ikke hente posisjon");
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, []);

  const disable = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setEnabled(false);
    setPosition(null);
    try {
      localStorage.removeItem("geo-enabled");
      sessionStorage.removeItem(CACHE_KEY);
    } catch { /* */ }
  }, []);

  // Auto-start watching if previously enabled
  useEffect(() => {
    if (enabled) {
      request();
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { position, loading, error, enabled, request, disable };
}
