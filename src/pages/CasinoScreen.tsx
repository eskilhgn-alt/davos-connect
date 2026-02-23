/**
 * CasinoScreen — Walking directions + info for Casino Davos
 * Shows user's own position + Dag Erik (Dawgen) position relative to casino
 * Special push feature for Dag Erik when within 200m
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserLocations } from "@/hooks/useUserLocations";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Navigation, Dice5, Footprints, Clock, MapPin,
  ExternalLink, Phone, Globe, ChevronUp, ChevronDown, User,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DAG_ERIK_ID = "8c66109a-2a99-4c91-bc7a-8de6a4020a06";
const DAG_ERIK_PROXIMITY_M = 200;

const CASINO = {
  lat: 46.7935,
  lon: 9.8360,
  name: "Casino Davos",
  address: "Promenade 63, 7270 Davos Platz",
  phone: "+41 81 415 56 00",
  website: "https://www.casinodavos.ch",
  googleMaps: "https://www.google.com/maps/dir/?api=1&destination=46.7935,9.8360&travelmode=walking",
  openingHours: [
    { day: "Man–Tor", time: "12:00–02:00" },
    { day: "Fre", time: "12:00–03:00" },
    { day: "Lør", time: "12:00–03:00" },
    { day: "Søn", time: "12:00–02:00" },
  ],
  minAge: 18,
  dressCode: "Smart casual",
  games: ["Roulette", "Blackjack", "Poker", "Spilleautomater"],
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isOpenNow(): { open: boolean; closes?: string; opens?: string } {
  const now = new Date();
  const dayIndex = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentMin = hour * 60 + minute;
  const isFriSat = dayIndex === 5 || dayIndex === 6;
  const openMin = 12 * 60;

  if (currentMin >= openMin) {
    return { open: true, closes: isFriSat ? "03:00" : "02:00" };
  }
  if (currentMin < (isFriSat ? 3 * 60 : 2 * 60)) {
    return { open: true, closes: isFriSat ? "03:00" : "02:00" };
  }
  return { open: false, opens: "12:00" };
}

const CasinoScreen: React.FC = () => {
  const geo = useGeolocation();
  const { user } = useAuth();
  const { locations } = useUserLocations();
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstance = React.useRef<L.Map | null>(null);
  const routeLayer = React.useRef<L.LayerGroup | null>(null);
  const dagMarkerRef = React.useRef<L.Marker | null>(null);
  const [distance, setDistance] = React.useState<number | null>(null);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [straightLine, setStraightLine] = React.useState<number | null>(null);
  const [routeError, setRouteError] = React.useState(false);
  const [infoExpanded, setInfoExpanded] = React.useState(false);
  const [dagPushSent, setDagPushSent] = React.useState(false);
  const openStatus = React.useMemo(isOpenNow, []);

  // Find Dag Erik's location from realtime locations
  const dagLocation = React.useMemo(() => {
    return locations.find((l) => l.user_id === DAG_ERIK_ID);
  }, [locations]);

  const dagDistanceToCasino = React.useMemo(() => {
    if (!dagLocation) return null;
    return Math.round(haversineMeters(dagLocation.lat, dagLocation.lon, CASINO.lat, CASINO.lon));
  }, [dagLocation]);

  // Straight-line distance for current user
  React.useEffect(() => {
    if (!geo.position) return;
    const d = haversineMeters(geo.position.lat, geo.position.lon, CASINO.lat, CASINO.lon);
    setStraightLine(Math.round(d));
  }, [geo.position]);

  // Special push for Dag Erik when within 200m of casino
  React.useEffect(() => {
    if (!user || user.id !== DAG_ERIK_ID) return;
    if (!geo.position || dagPushSent) return;

    const dist = haversineMeters(geo.position.lat, geo.position.lon, CASINO.lat, CASINO.lon);
    if (dist <= DAG_ERIK_PROXIMITY_M) {
      // Send push via edge function
      setDagPushSent(true);
      const sessionKey = `dag_casino_push_${new Date().toDateString()}`;
      if (localStorage.getItem(sessionKey)) return;
      localStorage.setItem(sessionKey, "1");

      supabase.functions.invoke("send-push-notification", {
        body: {
          user_ids: [DAG_ERIK_ID],
          title: "🎰 Dawgen, du er nær Casino!",
          message: `Du er bare ${Math.round(dist)}m unna Casino Davos! Lykken smiler i dag? 🍀`,
          url: "/casino",
        },
      }).catch(() => {});
    }
  }, [geo.position, user, dagPushSent]);

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const center: [number, number] = geo.position
      ? [geo.position.lat, geo.position.lon]
      : [CASINO.lat, CASINO.lon];

    const map = L.map(mapRef.current, {
      center,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Casino marker
    const casinoIcon = L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:hsl(var(--primary));border:3px solid hsl(var(--primary-foreground));box-shadow:0 2px 10px rgba(0,0,0,0.35);">
        <span style="font-size:20px;">🎰</span>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      className: "",
    });

    L.marker([CASINO.lat, CASINO.lon], { icon: casinoIcon })
      .addTo(map)
      .bindPopup(
        `<b>${CASINO.name}</b><br/>${CASINO.address}<br/><a href="${CASINO.googleMaps}" target="_blank" rel="noopener">Åpne i Google Maps</a>`
      );

    routeLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User walking route
  React.useEffect(() => {
    if (!geo.position || !mapInstance.current) return;

    const { lat, lon } = geo.position;
    const map = mapInstance.current;

    const userIcon = L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:hsl(var(--foreground));border:3px solid hsl(var(--background));box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size:15px;">📍</span>
      </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      className: "",
    });

    routeLayer.current?.clearLayers();
    L.marker([lat, lon], { icon: userIcon }).addTo(routeLayer.current!);

    fetch(
      `https://router.project-osrm.org/route/v1/foot/${lon},${lat};${CASINO.lon},${CASINO.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.code !== "Ok" || !data.routes?.length) {
          setRouteError(true);
          return;
        }

        const route = data.routes[0];
        setDistance(Math.round(route.distance));
        setDuration(Math.round(route.duration / 60));

        const coords = route.geometry.coordinates.map(
          ([lng, lt]: [number, number]) => [lt, lng] as [number, number]
        );

        L.polyline(coords, {
          color: "hsl(var(--primary))",
          weight: 5,
          opacity: 0.85,
          dashArray: "10 8",
        }).addTo(routeLayer.current!);

        const bounds = L.latLngBounds([
          [lat, lon],
          [CASINO.lat, CASINO.lon],
        ]);
        map.fitBounds(bounds, { padding: [60, 60] });
      })
      .catch(() => setRouteError(true));
  }, [geo.position]);

  // Dag Erik marker on map (always visible, realtime)
  React.useEffect(() => {
    if (!mapInstance.current || !routeLayer.current) return;

    // Remove old Dag marker
    if (dagMarkerRef.current) {
      routeLayer.current.removeLayer(dagMarkerRef.current);
      dagMarkerRef.current = null;
    }

    if (!dagLocation) return;

    const dagIcon = L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#f59e0b;border:3px solid #fef3c7;box-shadow:0 2px 10px rgba(0,0,0,0.35);">
        <span style="font-size:14px;font-weight:700;color:#fff;">D</span>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });

    const distText = dagDistanceToCasino !== null ? `${dagDistanceToCasino < 1000 ? dagDistanceToCasino + " m" : (dagDistanceToCasino / 1000).toFixed(1) + " km"} fra Casino` : "";

    dagMarkerRef.current = L.marker([dagLocation.lat, dagLocation.lon], { icon: dagIcon })
      .addTo(routeLayer.current)
      .bindPopup(`<b>🎲 Dawgen</b><br/>${distText}`);
  }, [dagLocation, dagDistanceToCasino]);

  const fmtDist = (m: number) =>
    m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;

  const isDagErik = user?.id === DAG_ERIK_ID;

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Casino"
        subtitle="Gangavstand til Casino Davos"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      {/* Status bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border bg-muted/30">
        <Dice5 size={22} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{CASINO.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                openStatus.open
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-red-500/15 text-red-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  openStatus.open ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {openStatus.open
                ? `Åpent – stenger ${openStatus.closes}`
                : `Stengt – åpner ${openStatus.opens}`}
            </span>
          </div>
        </div>

        {/* Distance info */}
        <div className="text-right shrink-0">
          {distance !== null && duration !== null ? (
            <>
              <p className="text-sm font-bold text-foreground flex items-center gap-1 justify-end">
                <Footprints size={14} />
                {duration} min
              </p>
              <p className="text-[10px] text-muted-foreground">{fmtDist(distance)} gangvei</p>
            </>
          ) : straightLine !== null ? (
            <>
              <p className="text-sm font-bold text-foreground flex items-center gap-1 justify-end">
                <MapPin size={14} />
                {fmtDist(straightLine)}
              </p>
              <p className="text-[10px] text-muted-foreground">luftlinje</p>
            </>
          ) : null}
        </div>
      </div>

      {/* Dawgen tracker bar */}
      <div className="px-4 py-2 flex items-center gap-3 border-b border-border bg-amber-500/5">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">
          D
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Dawgen
            {isDagErik && <span className="ml-1 text-amber-500">(deg)</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {dagLocation
              ? dagDistanceToCasino !== null
                ? `${fmtDist(dagDistanceToCasino)} fra Casino`
                : "Posisjon kjent"
              : "Posisjon ikke tilgjengelig"}
          </p>
        </div>
        {dagDistanceToCasino !== null && dagDistanceToCasino <= DAG_ERIK_PROXIMITY_M && (
          <span className="text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full animate-pulse">
            🎰 Nær Casino!
          </span>
        )}
        {dagDistanceToCasino !== null && (
          <span className="text-sm font-bold text-foreground">
            {fmtDist(dagDistanceToCasino)}
          </span>
        )}
      </div>

      {/* GPS status */}
      {!geo.position && (
        <div className="px-4 py-3 bg-muted/50 flex items-center gap-2">
          {geo.loading ? (
            <>
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Henter posisjon…</span>
            </>
          ) : !geo.enabled ? (
            <button
              onClick={() => geo.request()}
              className="flex items-center gap-2 text-xs text-primary font-medium"
            >
              <Navigation size={14} />
              Aktiver posisjon for å se rute
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Venter på GPS…</span>
          )}
        </div>
      )}

      {routeError && (
        <div className="px-4 py-2 bg-destructive/10 text-xs text-destructive">
          Kunne ikke beregne rute. Sjekk internett-tilkoblingen.
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1 w-full relative" />

      {/* Bottom info panel */}
      <div className="border-t border-border bg-card">
        <button
          onClick={() => setInfoExpanded((v) => !v)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            <Clock size={14} className="text-muted-foreground" />
            Info & åpningstider
          </span>
          {infoExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {infoExpanded && (
          <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
            <div className="grid grid-cols-2 gap-1">
              {CASINO.openingHours.map((h) => (
                <div key={h.day} className="flex justify-between text-xs text-muted-foreground px-2 py-1 rounded bg-muted/40">
                  <span className="font-medium text-foreground">{h.day}</span>
                  <span>{h.time}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-[11px] bg-muted px-2 py-1 rounded-full text-muted-foreground">
                🎂 {CASINO.minAge}+ år
              </span>
              <span className="text-[11px] bg-muted px-2 py-1 rounded-full text-muted-foreground">
                👔 {CASINO.dressCode}
              </span>
              {CASINO.games.map((g) => (
                <span key={g} className="text-[11px] bg-muted px-2 py-1 rounded-full text-muted-foreground">
                  🎲 {g}
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <a
                href={`tel:${CASINO.phone}`}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-muted hover:bg-muted/80 rounded-lg py-2.5 text-foreground transition-colors"
              >
                <Phone size={13} />
                Ring
              </a>
              <a
                href={CASINO.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-muted hover:bg-muted/80 rounded-lg py-2.5 text-foreground transition-colors"
              >
                <Globe size={13} />
                Nettside
              </a>
              <a
                href={CASINO.googleMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg py-2.5 transition-colors"
              >
                <ExternalLink size={13} />
                Google Maps
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CasinoScreen;
