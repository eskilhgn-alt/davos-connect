/**
 * WebcamsScreen – forklarer at webkameraer åpnes hos den offisielle
 * tilbyderen for aktiv tur, og lister det ACTIVE_TRIP eksplisitt refererer.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { ACTIVE_TRIP } from "@/config/trip";
import { Camera, ExternalLink } from "lucide-react";

export const WebcamsScreen: React.FC = () => {
  const trip = ACTIVE_TRIP;
  const hub = trip.officialLinks.webcams;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Webkameraer"
        subtitle={`${trip.destination}, ${trip.country}`}
        leftAction={<BackButton fallbackPath="/live" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Webkameraer åpnes hos den offisielle tilbyderen. Vi henter ikke lenger snapshots direkte
            inn i appen for aktiv tur.
          </p>

          {hub && (
            <a
              href={hub.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-border bg-muted/60 p-4 flex items-center gap-4 hover:bg-muted transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Camera className="text-primary" size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm font-semibold text-foreground">{hub.title}</p>
                <p className="text-xs text-muted-foreground truncate">{hub.url.replace(/^https?:\/\//, "")}</p>
              </div>
              <ExternalLink size={16} className="text-muted-foreground shrink-0" />
            </a>
          )}

          {trip.webcams.length > 0 && (
            <div className="rounded-2xl border border-border bg-muted/30 divide-y divide-border">
              {trip.webcams.map((cam) => (
                <a
                  key={cam.id}
                  href={cam.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
                >
                  <Camera size={18} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm font-semibold text-foreground">{cam.name}</p>
                    {cam.area && <p className="text-xs text-muted-foreground">{cam.area}</p>}
                  </div>
                  <ExternalLink size={14} className="text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebcamsScreen;
