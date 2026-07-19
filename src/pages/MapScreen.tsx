/**
 * MapScreen — hovedfane «Kart».
 * To adskilte visninger via segmenter:
 *  - Løypekart (offisielt eksternt løypekart for aktiv tur)
 *  - Crew (frivillig sanntidsposisjon; åpnes som egen skjerm)
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosSegmented } from "@/components/ui/davos-segmented";
import { DavosWebEmbed } from "@/components/live/DavosWebEmbed";
import { DavosButton } from "@/components/ui/davos-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Maximize2, ExternalLink, Users } from "lucide-react";
import { ACTIVE_TRIP } from "@/config/trip";

type MapSubTab = "trail" | "crew";

const MAP_TABS = [
  { value: "trail", label: "Løypekart" },
  { value: "crew", label: "Crew" },
];

export const MapScreen: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<MapSubTab>("trail");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const trip = ACTIVE_TRIP;
  const trailMap = trip.officialLinks.trailMap;
  const isEmbeddable = Boolean(trailMap?.embeddable);

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Kart" subtitle={`${trip.destination}, ${trip.country}`} />

      <div
        className="flex-1 flex flex-col overflow-hidden p-4"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}
      >
        <div className="mb-4 shrink-0">
          <DavosSegmented
            options={MAP_TABS}
            value={tab}
            onChange={(v) => setTab(v as MapSubTab)}
            className="w-full"
          />
        </div>

        {tab === "trail" ? (
          <>
            <div className="mb-4 flex items-start justify-between shrink-0 gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold text-foreground truncate">
                  {trailMap?.title ?? "Løypekart"}
                </h2>
                <p className="text-sm text-muted-foreground truncate">
                  {trailMap?.description ?? "Offisielt løypekart for aktiv tur"}
                </p>
              </div>
              {isEmbeddable && (
                <DavosButton
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(true)}
                  aria-label="Fullskjerm"
                >
                  <Maximize2 size={20} />
                </DavosButton>
              )}
            </div>

            <div className="flex-1 min-h-0">
              {isEmbeddable && trailMap ? (
                <DavosWebEmbed
                  title={trailMap.title}
                  url={trailMap.url}
                  embeddable={true}
                  height="100%"
                />
              ) : (
                <div className="h-full rounded-2xl border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Løypekartet for {trip.destination} åpnes hos den offisielle
                    tilbyderen. Live-visning i appen kommer i et senere trinn.
                  </p>
                  {trailMap && (
                    <a
                      href={trailMap.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
                    >
                      Åpne løypekart <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 rounded-2xl border border-border bg-muted/30 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <Users size={32} className="text-muted-foreground" strokeWidth={1.5} />
            <div className="space-y-1 max-w-xs">
              <h3 className="font-heading text-base font-semibold text-foreground">
                Crew-posisjon
              </h3>
              <p className="text-xs text-muted-foreground">
                Frivillig sanntidsposisjon for de i crewet som har skrudd på
                deling. Ingen blir sporet automatisk.
              </p>
            </div>
            <DavosButton onClick={() => navigate("/crew")}>Åpne crew-kart</DavosButton>
          </div>
        )}
      </div>

      {trailMap && (
        <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
          <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] p-0 rounded-none">
            <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm p-4 border-b border-border">
              <DialogTitle className="font-heading text-lg">{trailMap.title}</DialogTitle>
            </DialogHeader>
            <div className="pt-16 h-full">
              <iframe
                src={trailMap.url}
                title={trailMap.title}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="w-full h-full border-0"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default MapScreen;
