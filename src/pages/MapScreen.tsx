import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosSegmented } from "@/components/ui/davos-segmented";
import { DavosWebEmbed } from "@/components/live/DavosWebEmbed";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { Maximize2 } from "lucide-react";
import { MAPS } from "@/config/liveInfo";

type MapSubTab = "interaktiv" | "nord" | "syd";

const MAP_TABS = [
  { value: "interaktiv", label: "Interaktiv" },
  { value: "nord", label: "Nord" },
  { value: "syd", label: "Sør" },
];

export const MapScreen: React.FC = () => {
  const [mapSubTab, setMapSubTab] = React.useState<MapSubTab>("interaktiv");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const currentMap = MAPS[mapSubTab];

  return (
    <div 
      className="flex flex-col overflow-hidden"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Løypekart" subtitle="Davos Klosters" />

      {/* Map content */}
      <div 
        className="flex-1 flex flex-col overflow-hidden p-4"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)" }}
      >
        {/* Map sub-tabs */}
        <div className="mb-4 shrink-0">
          <DavosSegmented
            options={MAP_TABS}
            value={mapSubTab}
            onChange={(v) => setMapSubTab(v as MapSubTab)}
            className="w-full"
          />
        </div>

        {/* Map info */}
        <div className="mb-4 flex items-start justify-between shrink-0">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {currentMap.title}
            </h2>
            {currentMap.description && (
              <p className="text-sm text-muted-foreground">
                {currentMap.description}
              </p>
            )}
          </div>
          <DavosButton
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(true)}
            aria-label="Fullskjerm"
          >
            <Maximize2 size={20} />
          </DavosButton>
        </div>

        {/* Map embed - fills remaining space */}
        <div className="flex-1 min-h-0">
          <DavosWebEmbed
            title={currentMap.title}
            url={currentMap.url}
            embeddable={currentMap.embeddable !== false}
            height="100%"
          />
        </div>
      </div>

      {/* Fullscreen map modal */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] p-0 rounded-none">
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm p-4 border-b border-border">
            <DialogTitle className="font-heading text-lg">
              {currentMap.title}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-16 h-full">
            <iframe
              src={currentMap.url}
              title={currentMap.title}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              className="w-full h-full border-0"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MapScreen;
