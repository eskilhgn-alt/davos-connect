import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandSegmented } from "@/components/ui/brand-segmented";
import { ValThorensStatus } from "@/components/live/ValThorensStatus";
import { useTrip } from "@/contexts/TripContext";
import { liveScope } from "@/hooks/useValThorensLive";
import { resolveDestination } from "@/features/destination/resolveDestination";

type MapTab = "map" | "status";

// Kart-URL og live-statusstøtte kommer fra valgt turs destinasjonsoppsett
// (eller en eksplisitt Val Thorens-fallback). Andre turer får aldri
// Val Thorens-kart eller -status.
export const OFFICIAL_PISTE_MAP_URL =
  "https://lumiplay.link/interactive-map/les-3-vallees/fr";

export const MapScreen: React.FC = () => {
  const { selectedTrip } = useTrip();
  const dest = React.useMemo(() => resolveDestination(selectedTrip), [selectedTrip]);
  const liveSupported = dest.liveProvider === "lumiplan";
  const scope = liveScope(selectedTrip?.id ?? null, dest.liveProvider);

  const [tab, setTab] = React.useState<MapTab>(() =>
    new URLSearchParams(window.location.search).get("vis") === "status" ? "status" : "map",
  );

  React.useEffect(() => {
    if (!liveSupported && tab === "status") setTab("map");
  }, [liveSupported, tab]);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Løypekart"
        subtitle={dest.destination ? `${dest.destination} · offisielt interaktivt kart` : "Ingen tur valgt"}
      />
      {liveSupported && (
        <div className="shrink-0 border-b border-border bg-background px-4 py-2">
          <BrandSegmented
            options={[{ value: "map", label: "Kart" }, { value: "status", label: "Live status" }]}
            value={tab}
            onChange={(value) => setTab(value as MapTab)}
            className="w-full"
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1" style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}>
        {tab === "map" && (
          dest.pisteMap ? (
            <iframe
              src={dest.pisteMap.url}
              title={dest.pisteMap.title}
              className="absolute inset-0 h-full w-full border-0 bg-background"
              allow="geolocation; fullscreen"
              allowFullScreen
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center space-y-1 max-w-sm">
                <p className="font-heading text-sm font-semibold text-foreground">Løypekart er ikke konfigurert</p>
                <p className="text-xs text-muted-foreground">
                  Denne turen mangler kartkilde i destinasjonsoppsettet. Admin kan legge inn et interaktivt kart.
                </p>
              </div>
            </div>
          )
        )}

        {tab === "status" && (
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain p-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <ValThorensStatus supported={liveSupported} scope={scope} />
          </div>
        )}
      </div>
    </div>
  );
};

export default MapScreen;
