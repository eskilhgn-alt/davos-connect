/**
 * useGeolocation — returns the user's GPS position with high accuracy
 * Uses getCurrentPosition on an interval (avoids watchPosition HMR/stale-closure bugs)
 */
import { useState, useEffect, useCallback, useRef } from "react";

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy?: number;
}

const CACHE_KEY = "geo-position";
const CACHE_TTL = 5 * 60 * 1000;
const POLL_INTERVAL = 15_000; // 15s

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

function readEnabled(): boolean {
  try { return localStorage.getItem("geo-enabled") === "true"; } catch { return false; }
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(getCached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(readEnabled);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Posisjon støttes ikke");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const pos: GeoPosition = {
          lat: geo.coords.latitude,
          lon: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
        setPosition(pos);
        setCache(pos);
        setLoading(false);
      },
      (err) => {
        console.warn("Geolocation error:", err.message);
        setError("Kunne ikke hente posisjon");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }, []);

  const request = useCallback(() => {
    setLoading(true);
    setError(null);
    setEnabled(true);
    try { localStorage.setItem("geo-enabled", "true"); } catch { /* */ }
    fetchPosition();
  }, [fetchPosition]);

  const disable = useCallback(() => {
    setEnabled(false);
    setPosition(null);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    try {
      localStorage.removeItem("geo-enabled");
      sessionStorage.removeItem(CACHE_KEY);
    } catch { /* */ }
  }, []);

  // Auto-poll when enabled
  useEffect(() => {
    if (!enabled) return;
    fetchPosition();
    intervalRef.current = setInterval(fetchPosition, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [enabled, fetchPosition]);

  return { position, loading, error, enabled, request, disable };
}
