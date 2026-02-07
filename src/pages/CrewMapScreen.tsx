/**
 * CrewMapScreen ("Magnus?") — interactive map showing all users in realtime
 * with distance, last-updated indicators, and a clickable user list.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useUserLocations, UserLocation } from "@/hooks/useUserLocations";
import { useAuth } from "@/contexts/AuthContext";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { MapPin, Clock, Navigation } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MARKER_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function getColor(index: number) {
  return MARKER_COLORS[index % MARKER_COLORS.length];
}

/** Haversine distance in km */
function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  if (km < 0.1) return "< 100 m";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

const DAVOS_CENTER: [number, number] = [46.8, 9.84];

export const CrewMapScreen: React.FC = () => {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const leafletMap = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<L.CircleMarker[]>([]);
  const { locations, loading } = useUserLocations();
  const { user } = useAuth();
  const [listOpen, setListOpen] = React.useState(true);

  const myLoc = React.useMemo(
    () => locations.find((l) => l.user_id === user?.id),
    [locations, user?.id]
  );

  // Initialize map centered on user or Davos
  React.useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const center: [number, number] = myLoc
      ? [myLoc.lat, myLoc.lon]
      : DAVOS_CENTER;

    const map = L.map(mapRef.current, {
      center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    L.tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.7,
    }).addTo(map);

    L.control
      .attribution({ position: "bottomright" })
      .addAttribution(
        '© <a href="https://openstreetmap.org">OSM</a> | <a href="https://opensnowmap.org">OpenSnowMap</a>'
      )
      .addTo(map);

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center on own location when it first becomes available
  const hasCentered = React.useRef(false);
  React.useEffect(() => {
    if (myLoc && leafletMap.current && !hasCentered.current) {
      leafletMap.current.setView([myLoc.lat, myLoc.lon], 14);
      hasCentered.current = true;
    }
  }, [myLoc]);

  // Update markers
  React.useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

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

      const timeAgo = formatDistanceToNow(new Date(loc.updated_at), {
        addSuffix: true,
        locale: nb,
      });

      marker.bindTooltip(
        `<strong>${loc.display_name}</strong>${isMe ? " (deg)" : ""}<br/><span style="font-size:11px;opacity:.7">${timeAgo}</span>`,
        { permanent: false, direction: "top", offset: [0, -10] }
      );

      markersRef.current.push(marker);
    });
  }, [locations, user?.id]);

  const panTo = (loc: UserLocation) => {
    leafletMap.current?.setView([loc.lat, loc.lon], 16, { animate: true });
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Magnus?"
        subtitle="Se hvor alle er"
        leftAction={<BackButton fallbackPath="/mer" />}
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

        {/* Collapsible user list */}
        {locations.length > 0 && (
          <div className="absolute bottom-4 left-2 right-2 z-[500]">
            <button
              onClick={() => setListOpen((p) => !p)}
              className="w-full flex items-center justify-between bg-card/95 backdrop-blur-sm rounded-t-lg border border-border px-3 py-2"
            >
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MapPin size={14} className="text-primary" />
                {locations.length} brukere
              </span>
              <span className="text-xs text-muted-foreground">
                {listOpen ? "Skjul" : "Vis"}
              </span>
            </button>

            {listOpen && (
              <div className="bg-card/95 backdrop-blur-sm border border-t-0 border-border rounded-b-lg max-h-44 overflow-y-auto divide-y divide-border">
                {locations.map((loc, i) => {
                  const isMe = loc.user_id === user?.id;
                  const dist =
                    myLoc && !isMe
                      ? distanceKm(myLoc.lat, myLoc.lon, loc.lat, loc.lon)
                      : null;
                  const timeAgo = formatDistanceToNow(
                    new Date(loc.updated_at),
                    { addSuffix: true, locale: nb }
                  );

                  return (
                    <button
                      key={loc.user_id}
                      onClick={() => panTo(loc)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 active:bg-muted transition-colors"
                    >
                      <div className="relative">
                        <DavosAvatar
                          size="sm"
                          fallback={loc.display_name}
                          className="ring-2"
                          style={
                            { "--tw-ring-color": getColor(i) } as React.CSSProperties
                          }
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {loc.display_name}
                          {isMe && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (deg)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Clock size={10} />
                            {timeAgo}
                          </span>
                          {dist !== null && (
                            <span className="flex items-center gap-0.5">
                              <Navigation size={10} />
                              {formatDist(dist)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrewMapScreen;
