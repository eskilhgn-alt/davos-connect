/**
 * MatScreen – Restaurant Finder (Sprint 1: mock data)
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useGeolocation } from "@/hooks/useGeolocation";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Star,
  Clock,
  ExternalLink,
  Phone,
  Navigation,
  ChevronDown,
  Sparkles,
  Loader2,
  Search,
} from "lucide-react";

/* ── Category quick-picks ── */
const CATEGORIES = [
  { id: "all", label: "Alle" },
  { id: "junk", label: "Junk" },
  { id: "casual", label: "Casual" },
  { id: "fine", label: "Fin dining" },
  { id: "breakfast", label: "Frokost" },
  { id: "coffee", label: "Kaffe" },
  { id: "bar", label: "Bar + mat" },
] as const;

const RADIUS_OPTIONS = [
  { value: 500, label: "500 m" },
  { value: 2000, label: "2 km" },
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
] as const;

/* ── Mock restaurant data (Davos area) ── */
interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  rating: number;
  review_count: number;
  price_level: number;
  categories: string[];
  open_now: boolean | null;
  photo_url: string | null;
  website: string | null;
  phone: string | null;
  distance_m?: number;
  ai_summary?: string;
  why_this?: string;
}

const MOCK_PLACES: Place[] = [
  {
    id: "m1",
    name: "Bistro Gentiana",
    lat: 46.7985,
    lng: 9.8365,
    address: "Promenade 53, Davos",
    rating: 4.5,
    review_count: 312,
    price_level: 2,
    categories: ["casual", "all"],
    open_now: true,
    photo_url: null,
    website: "https://example.com",
    phone: "+41 81 410 17 17",
    ai_summary: "Populært lokalt bistro med alpint interiør og moderne europeisk meny. Kjent for fonduen og lokale viner.",
    why_this: "Høy rating, nær deg, bra pris-til-kvalitet. Åpent nå.",
  },
  {
    id: "m2",
    name: "Montana Stube",
    lat: 46.7932,
    lng: 9.8312,
    address: "Talstrasse 3, Davos",
    rating: 4.7,
    review_count: 189,
    price_level: 3,
    categories: ["fine", "all"],
    open_now: true,
    photo_url: null,
    website: null,
    phone: "+41 81 415 42 42",
    ai_summary: "Fin dining-restaurant med fokus på Graubünden-tradisjoner. Bord bør reserveres.",
    why_this: "Topp-rated for fin dining. Passer for en spesiell kveld.",
  },
  {
    id: "m3",
    name: "Schneider's",
    lat: 46.8021,
    lng: 9.8401,
    address: "Promenade 89, Davos",
    rating: 4.2,
    review_count: 543,
    price_level: 1,
    categories: ["junk", "bar", "all"],
    open_now: true,
    photo_url: null,
    website: null,
    phone: null,
    ai_summary: "Uformelt afterski-sted med burgere, nachos og lokalt øl. Perfekt for en gjeng.",
    why_this: "Billig, uformelt, gruppa liker det. Nært etter ski.",
  },
  {
    id: "m4",
    name: "Café Weber",
    lat: 46.7998,
    lng: 9.8378,
    address: "Bahnhofstrasse 1, Davos",
    rating: 4.4,
    review_count: 267,
    price_level: 1,
    categories: ["coffee", "breakfast", "all"],
    open_now: false,
    photo_url: null,
    website: "https://example.com",
    phone: "+41 81 413 45 45",
    ai_summary: "Klassisk kafé med hjemmebakte bakevarer og espresso. God frokost-meny.",
    why_this: "Best for frokost og kaffe i sentrum. Stengt nå.",
  },
  {
    id: "m5",
    name: "Pöstli Bar & Grill",
    lat: 46.7955,
    lng: 9.8290,
    address: "Mattastrasse 6, Davos",
    rating: 4.0,
    review_count: 156,
    price_level: 2,
    categories: ["bar", "casual", "all"],
    open_now: true,
    photo_url: null,
    website: null,
    phone: "+41 81 414 00 00",
    ai_summary: "Koselig bar med grill-meny. God stemning kveldstid, live musikk enkelte kvelder.",
    why_this: "Bra for casual kveld med mat og drikke.",
  },
  {
    id: "m6",
    name: "Hubli's Landhaus",
    lat: 46.7870,
    lng: 9.8200,
    address: "Landstrasse 14, Davos Platz",
    rating: 4.6,
    review_count: 98,
    price_level: 3,
    categories: ["fine", "casual", "all"],
    open_now: true,
    photo_url: null,
    website: null,
    phone: null,
    ai_summary: "Tradisjonelt Graubünden-vertshus med lokal mat og vin. Ekte lokal stemning, lite turisty.",
    why_this: "Høy local-vibe score. Autentisk og anbefalt av lokale.",
  },
];

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priceLabel(level: number) {
  return "💰".repeat(level);
}

/* ── Component ── */
export const MatScreen: React.FC = () => {
  const { position, loading: geoLoading, request: requestGeo, enabled: geoEnabled } = useGeolocation();
  const [category, setCategory] = React.useState("all");
  const [radius, setRadius] = React.useState(5000);
  const [openNowOnly, setOpenNowOnly] = React.useState(false);
  const [showRadiusPicker, setShowRadiusPicker] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Use Davos center as fallback
  const userLat = position?.lat ?? 46.8;
  const userLng = position?.lon ?? 9.84;

  const results = React.useMemo(() => {
    let places = MOCK_PLACES.map((p) => ({
      ...p,
      distance_m: haversineDistance(userLat, userLng, p.lat, p.lng),
    }));

    // Filter by category
    if (category !== "all") {
      places = places.filter((p) => p.categories.includes(category));
    }

    // Filter by radius
    places = places.filter((p) => (p.distance_m ?? 0) <= radius);

    // Filter open now
    if (openNowOnly) {
      places = places.filter((p) => p.open_now === true);
    }

    // Sort by simple score: rating * log(review_count) / distance
    places.sort((a, b) => {
      const scoreA = (a.rating * Math.log10(a.review_count + 1)) / Math.max(a.distance_m ?? 1, 100);
      const scoreB = (b.rating * Math.log10(b.review_count + 1)) / Math.max(b.distance_m ?? 1, 100);
      return scoreB - scoreA;
    });

    return places;
  }, [category, radius, openNowOnly, userLat, userLng]);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Mat" />

      <PullToRefreshWrapper
        onRefresh={async () => {}}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="px-4 pt-4 pb-10 space-y-4">
          {/* Location status */}
          {!geoEnabled && (
            <button
              onClick={requestGeo}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary text-sm font-medium"
            >
              <MapPin size={16} />
              Bruk min posisjon for bedre resultater
            </button>
          )}
          {geoEnabled && geoLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Henter posisjon…
            </div>
          )}

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  category === cat.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-3">
            {/* Radius picker */}
            <div className="relative">
              <button
                onClick={() => setShowRadiusPicker(!showRadiusPicker)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground"
              >
                {RADIUS_OPTIONS.find((r) => r.value === radius)?.label}
                <ChevronDown size={12} />
              </button>
              {showRadiusPicker && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[100px]">
                  {RADIUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setRadius(opt.value);
                        setShowRadiusPicker(false);
                      }}
                      className={cn(
                        "block w-full text-left px-3 py-2 text-xs",
                        radius === opt.value
                          ? "bg-muted font-semibold text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Open now toggle */}
            <button
              onClick={() => setOpenNowOnly(!openNowOnly)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                openNowOnly
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Clock size={12} />
              Åpent nå
            </button>

            <div className="flex-1" />

            {/* Dev badge */}
            <span className="px-2 py-1 rounded bg-accent/20 text-accent-foreground text-[10px] font-mono">
              MOCK DATA
            </span>
          </div>

          {/* Results */}
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Search size={32} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Ingen treff. Prøv å øke radius eller bytte kategori.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((place, idx) => {
                const expanded = expandedId === place.id;
                return (
                  <div
                    key={place.id}
                    className="rounded-2xl border border-border bg-card overflow-hidden"
                  >
                    {/* Main card */}
                    <button
                      onClick={() => setExpandedId(expanded ? null : place.id)}
                      className="w-full text-left p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">
                              #{idx + 1}
                            </span>
                            <h3 className="font-heading text-sm font-bold text-foreground truncate">
                              {place.name}
                            </h3>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {place.address}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1">
                            <Star size={12} className="text-primary fill-primary" />
                            <span className="text-xs font-semibold text-foreground">
                              {place.rating}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({place.review_count})
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {priceLabel(place.price_level)}
                          </span>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Navigation size={10} />
                          {place.distance_m! < 1000
                            ? `${Math.round(place.distance_m!)} m`
                            : `${(place.distance_m! / 1000).toFixed(1)} km`}
                        </span>
                        {place.open_now !== null && (
                          <span
                            className={cn(
                              "flex items-center gap-1 font-medium",
                              place.open_now ? "text-primary" : "text-destructive"
                            )}
                          >
                            <Clock size={10} />
                            {place.open_now ? "Åpent" : "Stengt"}
                          </span>
                        )}
                      </div>

                      {/* AI why-this */}
                      {place.why_this && (
                        <div className="flex items-start gap-1.5 mt-1">
                          <Sparkles size={12} className="text-primary shrink-0 mt-0.5" />
                          <p className="text-[11px] text-primary leading-snug">
                            {place.why_this}
                          </p>
                        </div>
                      )}
                    </button>

                    {/* Expanded details */}
                    {expanded && (
                      <div className="border-t border-border px-4 py-3 space-y-3">
                        {place.ai_summary && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {place.ai_summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {place.phone && (
                            <a
                              href={`tel:${place.phone}`}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone size={12} />
                              Ring
                            </a>
                          )}
                          {place.website && (
                            <a
                              href={place.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={12} />
                              Nettside
                            </a>
                          )}
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Navigation size={12} />
                            Naviger
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PullToRefreshWrapper>
    </div>
  );
};

export default MatScreen;
