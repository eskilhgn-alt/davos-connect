import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandSegmented } from "@/components/ui/brand-segmented";
import { ValThorensStatus } from "@/components/live/ValThorensStatus";
import { ACTIVE_TRIP } from "@/config/trip";

type MapTab = "map" | "status";

// This is the same Lumiplan map embedded by Val Thorens on its official site.
// Keeping the embed here gives the app the native search, filters, lift status,
// piste status, zoom and pan controls instead of sending the user to a link.
export const OFFICIAL_PISTE_MAP_URL =
  "https://lumiplay.link/interactive-map/les-3-vallees/fr";

export const MapScreen: React.FC = () => {
  const [tab, setTab] = React.useState<MapTab>("map");
  const trip = ACTIVE_TRIP;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Løypekart" subtitle={`${trip.destination} · offisielt interaktivt kart`} />
      <div className="shrink-0 border-b border-border bg-background px-4 py-2">
        <BrandSegmented
          options={[{ value: "map", label: "Kart" }, { value: "status", label: "Live status" }]}
          value={tab}
          onChange={(value) => setTab(value as MapTab)}
          className="w-full"
        />
      </div>

      <div className="relative min-h-0 flex-1" style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}>
        {tab === "map" && (
          <iframe
            src={OFFICIAL_PISTE_MAP_URL}
            title="Offisielt interaktivt løypekart for Val Thorens og Les 3 Vallées"
            className="absolute inset-0 h-full w-full border-0 bg-background"
            allow="geolocation; fullscreen"
            allowFullScreen
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}

        {tab === "status" && (
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain p-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <ValThorensStatus />
          </div>
        )}
      </div>
    </div>
  );
};

export default MapScreen;
