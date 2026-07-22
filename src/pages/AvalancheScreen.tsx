/**
 * AvalancheScreen – informasjonsside som lenker til offisielt Meteo-France
 * skredvarsel for Val Thorens. Vi presenterer ikke egen faregrad.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ACTIVE_TRIP } from "@/config/trip";
import { AlertTriangle, ExternalLink, ShieldAlert, Phone } from "lucide-react";

export const AvalancheScreen: React.FC = () => {
  const trip = ACTIVE_TRIP;
  const weather = trip.officialLinks.avalanche;
  const safety = trip.officialLinks.safety;
  const skiPatrol = trip.emergency
    .flatMap((g) => g.contacts)
    .find((c) => c.label.toLowerCase().includes("skipatrulje"));

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Skred"
        subtitle={`Offisielt varsel for ${trip.destination}`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-4">
          <div className="rounded-2xl border border-border bg-muted/50 p-5 flex gap-3">
            <ShieldAlert className="text-primary shrink-0 mt-0.5" size={22} />
            <div className="space-y-2">
              <h2 className="font-heading text-base font-semibold text-foreground">
                Sjekk offisielt skredvarsel før du drar ut
              </h2>
              <p className="text-sm text-muted-foreground">
                For {trip.destination} er Meteo-France offisiell kilde til fjellvær og skredfare.
                Vi viser ikke egen faregrad i appen – bruk lenken under for oppdatert varsel.
              </p>
            </div>
          </div>

          {weather && (
            <a
              href={weather.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-border bg-muted/60 p-4 flex items-center justify-between hover:bg-muted transition-colors"
            >
              <div className="min-w-0 pr-3">
                <p className="font-heading text-sm font-semibold text-foreground">{weather.title}</p>
                <p className="text-xs text-muted-foreground truncate">{weather.description ?? weather.url}</p>
              </div>
              <ExternalLink size={16} className="text-muted-foreground shrink-0" />
            </a>
          )}

          {safety && (
            <a
              href={safety.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-border bg-muted/40 p-4 flex items-center justify-between hover:bg-muted/60 transition-colors"
            >
              <div className="min-w-0 pr-3">
                <p className="font-heading text-sm font-semibold text-foreground">{safety.title}</p>
                <p className="text-xs text-muted-foreground truncate">Offisielle råd fra Val Thorens</p>
              </div>
              <ExternalLink size={16} className="text-muted-foreground shrink-0" />
            </a>
          )}

          {skiPatrol?.href && (
            <a
              href={skiPatrol.href}
              className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex items-center justify-between hover:bg-primary/10 transition-colors"
            >
              <div className="min-w-0 pr-3">
                <p className="font-heading text-sm font-semibold text-foreground">{skiPatrol.label}</p>
                <p className="text-xs text-muted-foreground">{skiPatrol.value}</p>
              </div>
              <Phone size={16} className="text-primary shrink-0" />
            </a>
          )}

          <div className="rounded-2xl border border-dashed border-border p-4 flex gap-3">
            <AlertTriangle className="text-muted-foreground shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-muted-foreground">
              Appen erstatter ikke offisielle skredvarsler eller lokale patruljer. Ved akutt fare,
              ring nødnummer og skipatrulje umiddelbart.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvalancheScreen;
