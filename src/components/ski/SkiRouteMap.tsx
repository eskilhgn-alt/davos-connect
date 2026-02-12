/**
 * SkiRouteMap — Shows GPS tracks on a Leaflet map
 * Yellow = lift (altitude increasing), Blue = skiing down
 * Day selector, zoomable, detailed
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { Mountain, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { format, subDays, addDays } from "date-fns";
import { nb } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TrackPoint {
  lat: number;
  lon: number;
  altitude: number;
  speed: number | null;
  direction: string;
  recorded_at: string;
  user_id: string;
}

interface ProfileMap {
  [userId: string]: { display_name: string; color: string };
}

const USER_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

const DAVOS_CENTER: [number, number] = [46.8, 9.84];

export const SkiRouteMap: React.FC = () => {
  const { user } = useAuth();
  const mapRef = React.useRef<HTMLDivElement>(null);
  const leafletMap = React.useRef<L.Map | null>(null);
  const layersRef = React.useRef<L.LayerGroup | null>(null);
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [tracks, setTracks] = React.useState<TrackPoint[]>([]);
  const [profiles, setProfiles] = React.useState<ProfileMap>({});
  const [loading, setLoading] = React.useState(true);
  const [selectedUser, setSelectedUser] = React.useState<string | null>(null);

  // Load profiles
  React.useEffect(() => {
    supabase.from("profiles").select("id, nickname, full_name").then(({ data }) => {
      if (!data) return;
      const map: ProfileMap = {};
      data.forEach((p: any, i: number) => {
        map[p.id] = {
          display_name: p.nickname || p.full_name || "Ukjent",
          color: USER_COLORS[i % USER_COLORS.length],
        };
      });
      setProfiles(map);
    });
  }, []);

  // Load tracks for selected date
  React.useEffect(() => {
    setLoading(true);
    supabase
      .from("ski_track_points")
      .select("lat, lon, altitude, speed, direction, recorded_at, user_id")
      .eq("day_date", selectedDate)
      .order("recorded_at", { ascending: true })
      .then(({ data }) => {
        setTracks((data as TrackPoint[]) || []);
        setLoading(false);
      });
  }, [selectedDate]);

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, {
      center: DAVOS_CENTER,
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    L.tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", { maxZoom: 18, opacity: 0.6 }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    leafletMap.current = map;
    return () => { map.remove(); leafletMap.current = null; };
  }, []);

  // Draw tracks
  React.useEffect(() => {
    const map = leafletMap.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    if (tracks.length === 0) return;

    // Group by user
    const userTracks = new Map<string, TrackPoint[]>();
    tracks.forEach((p) => {
      if (selectedUser && p.user_id !== selectedUser) return;
      const arr = userTracks.get(p.user_id) || [];
      arr.push(p);
      userTracks.set(p.user_id, arr);
    });

    const allBounds: L.LatLng[] = [];

    userTracks.forEach((points, userId) => {
      // Split into segments by direction
      let currentDirection = points[0]?.direction;
      let currentSegment: [number, number][] = [];

      const drawSegment = (segment: [number, number][], direction: string) => {
        if (segment.length < 2) return;
        const color = direction === "up" ? "#eab308" : "#3b82f6"; // yellow=lift, blue=down
        const weight = direction === "up" ? 3 : 4;
        const dashArray = direction === "up" ? "8, 6" : undefined;
        L.polyline(segment, {
          color,
          weight,
          opacity: 0.85,
          dashArray,
        }).addTo(layers);
      };

      points.forEach((p) => {
        allBounds.push(L.latLng(p.lat, p.lon));
        if (p.direction !== currentDirection) {
          drawSegment(currentSegment, currentDirection);
          currentSegment = [currentSegment[currentSegment.length - 1] || [p.lat, p.lon]];
          currentDirection = p.direction;
        }
        currentSegment.push([p.lat, p.lon]);
      });
      drawSegment(currentSegment, currentDirection);

      // Start/end markers
      if (points.length > 0) {
        const first = points[0];
        const last = points[points.length - 1];
        const name = profiles[userId]?.display_name || "Ukjent";

        L.circleMarker([first.lat, first.lon], {
          radius: 6, fillColor: "#22c55e", fillOpacity: 1, color: "#fff", weight: 2,
        }).bindTooltip(`${name} – Start`).addTo(layers);

        L.circleMarker([last.lat, last.lon], {
          radius: 6, fillColor: "#ef4444", fillOpacity: 1, color: "#fff", weight: 2,
        }).bindTooltip(`${name} – Slutt`).addTo(layers);
      }
    });

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds).pad(0.1));
    }
  }, [tracks, profiles, selectedUser]);

  const userIds = React.useMemo(() => {
    const set = new Set(tracks.map((t) => t.user_id));
    return Array.from(set);
  }, [tracks]);

  const prevDay = () => setSelectedDate(subDays(new Date(selectedDate + "T12:00:00"), 1).toISOString().slice(0, 10));
  const nextDay = () => {
    const next = addDays(new Date(selectedDate + "T12:00:00"), 1).toISOString().slice(0, 10);
    if (next <= new Date().toISOString().slice(0, 10)) setSelectedDate(next);
  };

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);
  const dateLabel = isToday ? "I dag" : format(new Date(selectedDate + "T12:00:00"), "EEEE d. MMM", { locale: nb });

  return (
    <section className="px-4 py-4">
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Mountain size={16} /> GPS-rutesporing
      </h2>

      {/* Day selector */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button onClick={prevDay} className="p-1.5 rounded-lg hover:bg-muted active:scale-95 transition-all">
          <ChevronLeft size={18} className="text-foreground" />
        </button>
        <span className="text-sm font-medium text-foreground capitalize">{dateLabel}</span>
        <button onClick={nextDay} disabled={isToday} className="p-1.5 rounded-lg hover:bg-muted active:scale-95 transition-all disabled:opacity-30">
          <ChevronRight size={18} className="text-foreground" />
        </button>
      </div>

      {/* User filter */}
      {userIds.length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedUser(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              !selectedUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <Users size={12} className="inline mr-1" />Alle
          </button>
          {userIds.map((uid) => (
            <button
              key={uid}
              onClick={() => setSelectedUser(selectedUser === uid ? null : uid)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedUser === uid ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {profiles[uid]?.display_name || "Ukjent"}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 350 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
            <DavosSkeleton className="w-20 h-4" />
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {tracks.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          Ingen GPS-spor for denne dagen
        </p>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-1 rounded bg-[#eab308]" style={{ borderTop: "2px dashed #eab308" }} />
          <span className="text-[10px] text-muted-foreground">Heis opp</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-1 rounded bg-[#3b82f6]" />
          <span className="text-[10px] text-muted-foreground">Løype ned</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
          <span className="text-[10px] text-muted-foreground">Start</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
          <span className="text-[10px] text-muted-foreground">Slutt</span>
        </div>
      </div>
    </section>
  );
};
