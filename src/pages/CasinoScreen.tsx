/**
 * CasinoScreen — Shows walking directions to nearest casino (Casino Davos)
 * Uses Leaflet with OpenStreetMap + OSRM routing
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Loader2, Navigation, Dice5, Footprints } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Casino Davos – Promenade 63, 7270 Davos Platz
const CASINO = { lat: 46.7935, lon: 9.8360, name: "Casino Davos", address: "Promenade 63, 7270 Davos Platz" };

const CasinoScreen: React.FC = () => {
  const geo = useGeolocation();
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstance = React.useRef<L.Map | null>(null);
  const routeLayer = React.useRef<L.LayerGroup | null>(null);
  const [distance, setDistance] = React.useState<number | null>(null);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [routeError, setRouteError] = React.useState(false);

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [CASINO.lat, CASINO.lon],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Casino marker
    const casinoIcon = L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:hsl(var(--primary));border:3px solid hsl(var(--primary-foreground));box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size:18px;">🎰</span>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });

    L.marker([CASINO.lat, CASINO.lon], { icon: casinoIcon })
      .addTo(map)
      .bindPopup(`<b>${CASINO.name}</b><br/>${CASINO.address}`);

    routeLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Fetch walking route when position available
  React.useEffect(() => {
    if (!geo.position || !mapInstance.current) return;

    const { lat, lon } = geo.position;
    const map = mapInstance.current;

    // User marker
    const userIcon = L.divIcon({
      html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:hsl(var(--foreground));border:3px solid hsl(var(--background));box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <span style="font-size:14px;">📍</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      className: "",
    });

    // Clear previous
    routeLayer.current?.clearLayers();
    L.marker([lat, lon], { icon: userIcon }).addTo(routeLayer.current!);

    // Fetch walking route from OSRM
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
          weight: 4,
          opacity: 0.8,
          dashArray: "8 6",
        }).addTo(routeLayer.current!);

        // Fit bounds
        const bounds = L.latLngBounds([
          [lat, lon],
          [CASINO.lat, CASINO.lon],
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
      })
      .catch(() => setRouteError(true));
  }, [geo.position]);

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

      {/* Info bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border bg-muted/30">
        <Dice5 size={20} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{CASINO.name}</p>
          <p className="text-xs text-muted-foreground">{CASINO.address}</p>
        </div>
        {distance !== null && duration !== null && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-foreground flex items-center gap-1 justify-end">
              <Footprints size={14} />
              {duration} min
            </p>
            <p className="text-[10px] text-muted-foreground">
              {distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`}
            </p>
          </div>
        )}
      </div>

      {/* GPS status */}
      {!geo.position && (
        <div className="px-4 py-3 bg-muted/50 flex items-center gap-2">
          {geo.loading ? (
            <>
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Henter posisjon...</span>
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
            <span className="text-xs text-muted-foreground">Venter på GPS...</span>
          )}
        </div>
      )}

      {routeError && (
        <div className="px-4 py-2 bg-destructive/10 text-xs text-destructive">
          Kunne ikke beregne rute. Sjekk internett-tilkoblingen.
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1 w-full" />
    </div>
  );
};

export default CasinoScreen;
