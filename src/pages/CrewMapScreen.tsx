/**
 * CrewMapScreen — full-screen map med frivillig sanntidsposisjon.
 * Deling er strengt opt-in via `useLocationTracker.startSharing()`.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useUserLocations, UserLocation } from "@/hooks/useUserLocations";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationTracker } from "@/hooks/useLocationTracker";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { BrandAvatar } from "@/components/ui/brand-avatar";
import { BrandButton } from "@/components/ui/brand-button";
import { MapPin, Clock, Navigation, Search, Crosshair, X, BatteryLow, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ACTIVE_TRIP } from "@/config/trip";

const MARKER_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

function getColor(index: number) {
  return MARKER_COLORS[index % MARKER_COLORS.length];
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

const TRIP_CENTER: [number, number] = [ACTIVE_TRIP.center.lat, ACTIVE_TRIP.center.lon];

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

/** Escaper som gjør at brukerdata trygt kan settes inn i HTML/attributter. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tillat kun http(s)-URL-er i avatar-img. Alt annet faller tilbake til initial. */
function safeAvatarUrl(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch { /* */ }
  return null;
}

function createAvatarIcon(avatarUrl: string | undefined, color: string, isMe: boolean): L.DivIcon {
  const size = isMe ? 40 : 32;
  const border = isMe ? 4 : 3;
  const safeUrl = safeAvatarUrl(avatarUrl);
  const imgHtml = safeUrl
    ? `<img src="${escapeHtml(safeUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" crossorigin="anonymous" alt="" />`
    : `<div style="width:100%;height:100%;border-radius:50%;background:#888;display:flex;align-items:center;justify-content:center;color:#fff;font-size:${size * 0.35}px;font-weight:700;">?</div>`;

  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;border:${border}px solid ${escapeHtml(color)};overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:#fff;">${imgHtml}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "",
  });
}

export const CrewMapScreen: React.FC = () => {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const leafletMap = React.useRef<L.Map | null>(null);
  const markersRef = React.useRef<L.Marker[]>([]);
  const searchMarkerRef = React.useRef<L.Marker | null>(null);
  const { locations, loading } = useUserLocations();
  const { user } = useAuth();
  const { enabled: sharingEnabled, startSharing, stopSharing } = useLocationTracker();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout>>();
  const [userFilter, setUserFilter] = React.useState("");

  const myLoc = React.useMemo(
    () => locations.find((l) => l.user_id === user?.id),
    [locations, user?.id]
  );

  const sortedLocations = React.useMemo(() => {
    if (!myLoc) return locations;
    return [...locations].sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      const dA = distanceKm(myLoc.lat, myLoc.lon, a.lat, a.lon);
      const dB = distanceKm(myLoc.lat, myLoc.lon, b.lat, b.lon);
      return dA - dB;
    });
  }, [locations, myLoc, user?.id]);

  const filteredLocations = React.useMemo(() => {
    if (!userFilter.trim()) return sortedLocations;
    const q = userFilter.toLowerCase();
    return sortedLocations.filter((l) =>
      l.display_name?.toLowerCase().includes(q)
    );
  }, [sortedLocations, userFilter]);

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const center: [number, number] = myLoc ? [myLoc.lat, myLoc.lon] : TRIP_CENTER;
    const map = L.map(mapRef.current, { center, zoom: 14, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    L.tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", { maxZoom: 18, opacity: 0.7 }).addTo(map);
    L.control.attribution({ position: "bottomright" }).addAttribution('© <a href="https://openstreetmap.org">OSM</a> | <a href="https://opensnowmap.org">OpenSnowMap</a>').addTo(map);
    leafletMap.current = map;
    return () => { map.remove(); leafletMap.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCentered = React.useRef(false);
  React.useEffect(() => {
    if (myLoc && leafletMap.current && !hasCentered.current) {
      leafletMap.current.setView([myLoc.lat, myLoc.lon], 14);
      hasCentered.current = true;
    }
  }, [myLoc]);

  // Update markers with avatar icons
  React.useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    locations.forEach((loc, i) => {
      const isMe = loc.user_id === user?.id;
      const color = getColor(i);
      const icon = createAvatarIcon(loc.avatar_url, color, isMe);
      const marker = L.marker([loc.lat, loc.lon], { icon }).addTo(map);
      const timeAgo = formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true, locale: nb });
      marker.bindTooltip(
        `<strong>${escapeHtml(loc.display_name ?? "Ukjent")}</strong>${isMe ? " (deg)" : ""}<br/><span style="font-size:11px;opacity:.7">${escapeHtml(timeAgo)}</span>`,
        { permanent: false, direction: "top", offset: [0, -20] }
      );
      markersRef.current.push(marker);
    });
  }, [locations, user?.id]);

  const panTo = (loc: UserLocation) => {
    leafletMap.current?.setView([loc.lat, loc.lon], 16, { animate: true });
  };

  const recenter = () => {
    if (myLoc && leafletMap.current) {
      leafletMap.current.setView([myLoc.lat, myLoc.lon], 15, { animate: true });
    }
  };

  const handleSearch = React.useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=9.6,46.7,10.1,46.9&bounded=1&limit=5`);
        const data: SearchResult[] = await res.json();
        setSearchResults(data);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, []);

  const selectSearchResult = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    leafletMap.current?.setView([lat, lon], 16, { animate: true });
    if (searchMarkerRef.current) searchMarkerRef.current.remove();
    const icon = L.divIcon({
      html: `<div style="width:24px;height:24px;background:hsl(var(--primary));border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], className: "",
    });
    searchMarkerRef.current = L.marker([lat, lon], { icon }).addTo(leafletMap.current!);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Crew" subtitle="Frivillig sanntidsposisjon" leftAction={<BackButton fallbackPath="/kart" />} />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Map */}
        <div className="relative" style={{ height: "55vh", minHeight: 300 }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <BrandSkeleton className="w-20 h-4" />
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />

          <button onClick={() => setSearchOpen(true)} className="absolute top-3 left-3 z-[500] bg-card/95 backdrop-blur-sm border border-border rounded-lg p-2.5 shadow-sm active:scale-95 transition-transform" aria-label="Søk sted">
            <Search size={18} className="text-foreground" />
          </button>

          {myLoc && (
            <button onClick={recenter} className="absolute top-3 right-14 z-[500] bg-card/95 backdrop-blur-sm border border-border rounded-lg p-2.5 shadow-sm active:scale-95 transition-transform" aria-label="Sentrer på meg">
              <Crosshair size={18} className="text-foreground" />
            </button>
          )}

          {/* Search overlay */}
          {searchOpen && (
            <div className="absolute inset-0 z-[600] bg-background/95 backdrop-blur-sm flex flex-col p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" autoFocus placeholder="Søk etter lokasjon..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <button onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }} className="p-2">
                  <X size={20} className="text-muted-foreground" />
                </button>
              </div>
              {searching && <p className="text-xs text-muted-foreground px-1">Søker...</p>}
              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => selectSearchResult(r)} className="w-full text-left px-2 py-3 hover:bg-muted/50 active:bg-muted transition-colors">
                    <p className="text-sm text-foreground leading-snug">{r.display_name}</p>
                  </button>
                ))}
                {searchQuery && !searching && searchResults.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Ingen resultater</p>}
              </div>
            </div>
          )}
        </div>

        {/* User list */}
        <div className="border-t border-border">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <MapPin size={14} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">{locations.length} brukere</span>
          </div>

          {locations.length > 4 && (
            <div className="px-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Filtrer brukere..." value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {filteredLocations.map((loc, i) => {
              const isMe = loc.user_id === user?.id;
              const dist = myLoc && !isMe ? distanceKm(myLoc.lat, myLoc.lon, loc.lat, loc.lon) : null;
              const timeAgo = formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true, locale: nb });
              const origIdx = locations.findIndex((l) => l.user_id === loc.user_id);

              return (
                <button key={loc.user_id} onClick={() => panTo(loc)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors">
                  <BrandAvatar
                    src={loc.avatar_url}
                    size="sm"
                    fallback={loc.display_name}
                    className="ring-2 flex-shrink-0"
                    style={{ "--tw-ring-color": getColor(origIdx >= 0 ? origIdx : i) } as React.CSSProperties}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {loc.display_name}
                      {isMe && <span className="text-xs text-muted-foreground ml-1">(deg)</span>}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Clock size={10} />{timeAgo}</span>
                      {dist !== null && <span className="flex items-center gap-0.5"><Navigation size={10} />{formatDist(dist)}</span>}
                    </div>
                  </div>
                  <Navigation size={14} className="text-muted-foreground flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Deling av posisjon (opt-in) */}
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Shield size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              Posisjonsdeling er frivillig og av som standard. Når du slår det på deles din posisjon med resten av crewet ca. hvert 30. sekund så lenge appen er åpen. Slår du det av, fjernes din posisjon umiddelbart. Vi kan ikke garantere bakgrunnssporing i iOS PWA.
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BatteryLow size={14} />
            <span>Kontinuerlig GPS trekker batteri. Slå av når du ikke trenger å dele.</span>
          </div>
          {sharingEnabled ? (
            <BrandButton onClick={stopSharing} variant="outline" className="w-full">
              Stopp deling av posisjon
            </BrandButton>
          ) : (
            <BrandButton onClick={startSharing} className="w-full">
              Del min posisjon
            </BrandButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrewMapScreen;
