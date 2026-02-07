/**
 * CrewMapScreen — shows all users on an interactive Leaflet map with ski slopes
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useUserLocations } from "@/hooks/useUserLocations";
import { useAuth } from "@/contexts/AuthContext";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Color palette for user markers
const MARKER_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function getColor(index: number) {
  return MARKER_COLORS[index % MARKER_COLORS.length];
}

const DAVOS_CENTER: [number, number] = [46.80, 9.84];

export const CrewMapScreen: React.FC = () => {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const leafletMap = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<L.CircleMarker[]>([]);
  const { locations, loading } = useUserLocations();
  const { user } = useAuth();

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current, {
      center: DAVOS_CENTER,
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    // OpenStreetMap base layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    // OpenSnowMap ski overlay for pistes/trails
    L.tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.7,
    }).addTo(map);

    // Attribution
    L.control
      .attribution({ position: "bottomright" })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a> | <a href="https://opensnowmap.org">OpenSnowMap</a>')
      .addTo(map);

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  // Update markers when locations change
  React.useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    locations.forEach((loc, i) => {
      const isMe = loc.user_id === user?.id;
      const color = getColor(i);

      const marker = L.circleMarker([loc.lat, loc.lon], {
        radius: isMe ? 10 : 7,
        fillColor: color,
        color: isMe ? "#ffffff" : color,
        weight: isMe ? 3 : 1.5,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      marker.bindTooltip(
        `<strong>${loc.display_name}</strong>${isMe ? " (deg)" : ""}`,
        { permanent: false, direction: "top", offset: [0, -10] }
      );

      markersRef.current.push(marker);
    });
  }, [locations, user?.id]);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Crew-kart"
        subtitle="Se hvor alle er"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 min-h-0 relative"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <DavosSkeleton className="w-20 h-4" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Legend */}
        {locations.length > 0 && (
          <div className="absolute bottom-4 left-4 z-[500] bg-card/95 backdrop-blur-sm rounded-lg border border-border p-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-foreground mb-1.5">Brukere</p>
            <div className="space-y-1">
              {locations.map((loc, i) => (
                <div key={loc.user_id} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: getColor(i) }}
                  />
                  <span className="text-xs text-muted-foreground truncate">
                    {loc.display_name}
                    {loc.user_id === user?.id && " (deg)"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CrewMapScreen;
