import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ValThorensStatus } from "@/components/live/ValThorensStatus";
import { ACTIVE_TRIP } from "@/config/trip";

const SnowInfoScreen: React.FC = () => (
  <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
    <AppHeader title="Snø & åpning" subtitle={ACTIVE_TRIP.destination} leftAction={<BackButton fallbackPath="/live" />} />
    <div className="flex-1 overflow-y-auto overscroll-contain p-4" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
      <ValThorensStatus />
    </div>
  </div>
);

export default SnowInfoScreen;
