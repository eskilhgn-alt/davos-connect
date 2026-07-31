/**
 * DiscoverScreen — «Oppdag» for valgt tur.
 *
 * Liste-først. Delte steder + delt Gütta-match for alle med samme tur.
 * Avstand er personlig og beregnes lokalt fra egen ferske posisjon.
 * Kartvisning kommer som neste steg (veksleren viser ærlig status).
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useTrip } from "@/contexts/TripContext";
import { useLocationSharing } from "@/contexts/LocationSharingContext";
import { useDiscover } from "@/features/discover/useDiscover";
import { guttaMatch, matchLabel } from "@/features/discover/guttaMatch";
import {
  DISTANCE_UNAVAILABLE_TEXT,
  formatDistance,
  personalDistanceMeters,
} from "@/features/discover/distance";
import {
  CATEGORY_LABELS,
  DISCOVER_CATEGORIES,
  type DiscoverCategory,
  type DiscoverPlace,
} from "@/features/discover/types";
import { cn } from "@/lib/utils";
import { Compass, ExternalLink, Loader2, MapPin, RefreshCw, Star } from "lucide-react";

const ERROR_TEXT: Record<string, string> = {
  provider_not_configured: "Stedsdata er ikke satt opp for denne turen ennå.",
  discovery_not_configured: "Oppdag er ikke konfigurert for denne turen ennå.",
  category_not_enabled: "Denne kategorien er ikke slått på for turen.",
  trip_archived: "Denne turen er arkivert. Oppdag henter ikke nye anbefalinger.",
  destination_not_configured: "Denne turen mangler et verifisert destinasjonssenter.",
  not_trip_member: "Du er ikke medlem av denne turen.",
  rate_limited: "For mange forespørsler. Prøv igjen om litt.",
  timeout: "Tidsavbrudd mot stedstjenesten. Prøv igjen.",
  provider_error: "Stedstjenesten svarte ikke. Prøv igjen senere.",
};

const PlaceRow: React.FC<{ place: DiscoverPlace; distance: number | null }> = ({
  place,
  distance,
}) => {
  // Gütta-match kommer kun fra førsteparts gruppesignaler. Uten slike signaler
  // vises en ærlig «Ikke nok gruppedata» — aldri en score fra Google-innhold.
  const match = guttaMatch(place, null);
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground truncate">
            {place.name}
          </h3>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {CATEGORY_LABELS[place.category]}
            {place.openNow != null && (
              <span className="ml-2 normal-case tracking-normal">
                {place.openNow ? "Åpent nå" : "Stengt nå"}
              </span>
            )}
            {place.priceLevel != null && (
              <span className="ml-2 normal-case tracking-normal font-mono">
                {"€".repeat(Math.max(1, place.priceLevel))}
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
          {matchLabel(match)}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {match.available
          ? match.reasons.join(" · ")
          : "Gütta-match krever gruppedata (lagret, stemt eller besøkt) fra turen."}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {place.rating != null && (
          <span className="inline-flex items-center gap-1">
            <Star size={12} strokeWidth={1.8} />
            <span className="font-mono">{place.rating.toFixed(1)}</span>
            {place.ratingCount != null && <span>({place.ratingCount})</span>}
            <span>· Google Maps</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <MapPin size={12} strokeWidth={1.8} />
          <span className={cn(distance == null && "italic")}>{formatDistance(distance)}</span>
        </span>
        {place.providerUrl && (
          <a
            href={place.providerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            <ExternalLink size={12} strokeWidth={1.8} />
            Se på Google Maps
          </a>
        )}
      </div>
    </li>
  );
};

const DiscoverScreen: React.FC = () => {
  const { selectedTrip } = useTrip();
  const [category, setCategory] = React.useState<DiscoverCategory>("spise");
  const [view, setView] = React.useState<"liste" | "kart">("liste");
  const { places, attribution, loading, error, notConfigured, archived, refetch } =
    useDiscover(category);
  const { enabled, position, positionUpdatedAt } = useLocationSharing();

  // Personlig avstand: kun egen posisjon, aldri andre brukere.
  const own = React.useMemo(
    () => ({
      enabled,
      position: position ? { lat: position.lat, lon: position.lon } : null,
      // Faktisk måletidspunkt. Aldri Date.now() ved rerender.
      updatedAt: positionUpdatedAt,
    }),
    [enabled, position, positionUpdatedAt],
  );

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Oppdag"
        leftAction={<BackButton />}
        rightAction={
          <button
            onClick={() => void refetch()}
            className="tap-target flex items-center justify-center text-muted-foreground"
            aria-label="Oppdater steder"
          >
            <RefreshCw size={18} strokeWidth={1.8} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="px-4 pt-4 space-y-4" style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 32px)" }}>
          <p className="text-xs text-muted-foreground">
            Anbefalinger rundt {selectedTrip?.destination || "turen"}. Alle i turen ser de samme
            stedene og samme Gütta-match.
          </p>

          <div className="flex gap-2" role="tablist" aria-label="Visning">
            {(["liste", "kart"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  view === v ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground",
                )}
              >
                {v === "liste" ? "Liste" : "Kart"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {DISCOVER_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  category === c ? "bg-muted border-foreground text-foreground" : "border-border text-muted-foreground",
                )}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {!enabled && (
            <p className="text-[11px] text-muted-foreground">{DISTANCE_UNAVAILABLE_TEXT}.</p>
          )}

          {archived ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Arkivert tur</p>
              <p className="mt-1">
                Oppdag er skrivebeskyttet her og henter ingen nye anbefalinger. Dette er ikke
                lagrede steder fra turen — bare live-anbefalinger som er slått av for arkiv.
              </p>
            </div>
          ) : view === "kart" ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center">
              <Compass size={20} strokeWidth={1.6} className="mx-auto text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                {mapCapability.allowed
                  ? "Kartvisning via Places UI Kit kommer her."
                  : MAP_BLOCKED_TEXT[mapCapability.reason]}
              </p>
            </div>
          ) : notConfigured ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              Denne turen mangler et verifisert destinasjonssenter. Admin må sette det opp før
              Oppdag kan hente steder.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              {ERROR_TEXT[error] ?? "Kunne ikke hente steder akkurat nå."}
            </div>
          ) : places.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
              Ingen steder funnet i denne kategorien.
            </div>
          ) : (
            <>
              <ul className="space-y-2.5">
                {places.map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    distance={personalDistanceMeters(own, { lat: p.lat, lon: p.lon })}
                  />
                ))}
              </ul>
              {attribution && (
                <p className="pt-1 text-center text-[11px] text-muted-foreground">{attribution}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscoverScreen;
