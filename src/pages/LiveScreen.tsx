/**
 * LiveScreen – radar + lenke til offisielle Val Thorens webkameraer.
 * Vi henter ikke lenger Feratel-/Davos-snapshots eller proxykaller.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { WindyEmbed } from "@/components/live";
import { ACTIVE_TRIP } from "@/config/trip";
import { Camera, ExternalLink, CloudSun } from "lucide-react";
import { Link } from "react-router-dom";

export const LiveScreen: React.FC = () => {
  const trip = ACTIVE_TRIP;
  const webcamsLink = trip.officialLinks.webcams;
  const weatherLink = trip.officialLinks.weather;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Live"
        subtitle={`Radar & webkameraer · ${trip.destination}`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-6">
          <section>
            <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3">
              Live værradar
            </h2>
            <WindyEmbed className="h-[350px]" overlay="radar" lat={trip.center.lat} lon={trip.center.lon} />
            <p className="text-xs text-muted-foreground/70 mt-2 text-center">
              Kilde: Windy · Sentrert på {trip.destination}
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Webkameraer
              </h2>
              <Link to="/webcams" className="text-xs text-primary hover:underline">
                Detaljer
              </Link>
            </div>

            {webcamsLink ? (
              <a
                href={webcamsLink.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-border bg-muted/50 p-4 flex items-center gap-4 hover:bg-muted transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Camera className="text-primary" size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold text-foreground">
                    Offisielle Val Thorens-webkameraer
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Live bilder fra sentrum, løyper og topper
                  </p>
                </div>
                <ExternalLink size={16} className="text-muted-foreground shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Webkameraer ikke konfigurert for aktiv tur.</p>
            )}

            {weatherLink && (
              <a
                href={weatherLink.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-border bg-muted/30 p-4 flex items-center gap-4 hover:bg-muted/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CloudSun className="text-primary" size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold text-foreground">
                    {weatherLink.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Offisielt fjellvær og skredvarsel
                  </p>
                </div>
                <ExternalLink size={16} className="text-muted-foreground shrink-0" />
              </a>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default LiveScreen;
