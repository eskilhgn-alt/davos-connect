import * as React from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, LocateFixed, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandSegmented } from "@/components/ui/brand-segmented";
import { ValThorensStatus } from "@/components/live/ValThorensStatus";
import { ACTIVE_TRIP } from "@/config/trip";

type MapTab = "map" | "status";

export const MapScreen: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<MapTab>("map");
  const mapNode = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const locationMarker = React.useRef<L.CircleMarker | null>(null);
  const trip = ACTIVE_TRIP;

  React.useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    const map = L.map(mapNode.current, {
      center: [trip.center.lat, trip.center.lon],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      crossOrigin: true,
    }).addTo(map);
    L.tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.82,
      crossOrigin: true,
    }).addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a> · <a href="https://opensnowmap.org">OpenSnowMap</a>')
      .addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [trip.center.lat, trip.center.lon]);

  React.useEffect(() => {
    if (tab === "map") requestAnimationFrame(() => mapRef.current?.invalidateSize());
  }, [tab]);

  const centerTrip = () => mapRef.current?.setView([trip.center.lat, trip.center.lon], 14, { animate: true });

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      const point: L.LatLngExpression = [position.coords.latitude, position.coords.longitude];
      if (locationMarker.current) locationMarker.current.setLatLng(point);
      else {
        locationMarker.current = L.circleMarker(point, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        }).addTo(mapRef.current!);
      }
      mapRef.current?.setView(point, 16, { animate: true });
    }, () => undefined, { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 });
  };

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Løypekart" subtitle={`${trip.destination} · live status`} />
      <div className="px-4 py-2 border-b border-border bg-background shrink-0">
        <BrandSegmented
          options={[{ value: "map", label: "Kart" }, { value: "status", label: "Live status" }]}
          value={tab}
          onChange={(value) => setTab(value as MapTab)}
          className="w-full"
        />
      </div>

      <div className="relative flex-1 min-h-0" style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}>
        <div ref={mapNode} className={tab === "map" ? "absolute inset-0" : "absolute inset-0 invisible pointer-events-none"} />

        {tab === "map" && (
          <>
            <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2">
              <button type="button" onClick={centerTrip} className="tap-target rounded-xl border border-border bg-card/95 shadow-sm backdrop-blur flex items-center justify-center" aria-label="Sentrer på Val Thorens">
                <Crosshair size={18} />
              </button>
              <button type="button" onClick={locateMe} className="tap-target rounded-xl border border-border bg-card/95 shadow-sm backdrop-blur flex items-center justify-center" aria-label="Vis min posisjon">
                <LocateFixed size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/crew")}
              className="absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-border bg-card/95 px-4 py-3 text-xs font-semibold text-foreground shadow-md backdrop-blur flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Users size={16} /> Crew-kart
            </button>
          </>
        )}

        {tab === "status" && (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4" style={{ WebkitOverflowScrolling: "touch" }}>
            <ValThorensStatus />
          </div>
        )}
      </div>
    </div>
  );
};

export default MapScreen;
