/**
 * useGeolocation — returns the user's GPS position (cached in sessionStorage)
 */
import { useState, useEffect, useCallback } from "react";

export interface GeoPosition {
  lat: number;
  lon: number;
}

const CACHE_KEY = "geo-position";
const CACHE_TTL = 10 * 60 * 1000; // 10 min

function getCached(): GeoPosition | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed._ts > CACHE_TTL) return null;
    return { lat: parsed.lat, lon: parsed.lon };
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
  const [position, setPosition] = useState<GeoPosition | null>(getCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("geo-enabled") === "true"; } catch { return false; }
  });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Posisjon støttes ikke");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const pos: GeoPosition = {
          lat: Math.round(geo.coords.latitude * 100) / 100,
          lon: Math.round(geo.coords.longitude * 100) / 100,
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
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    setPosition(null);
    try {
      localStorage.removeItem("geo-enabled");
      sessionStorage.removeItem(CACHE_KEY);
    } catch { /* */ }
  }, []);

  // Auto-request if previously enabled
  useEffect(() => {
    if (enabled && !position) {
      request();
    }
  }, [enabled, position, request]);

  return { position, loading, error, enabled, request, disable };
}
