import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosSegmented } from "@/components/ui/davos-segmented";
import { DavosWebEmbed } from "@/components/live/DavosWebEmbed";
import { WebcamCard } from "@/components/live/WebcamCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { Maximize2 } from "lucide-react";
import {
  MAPS,
  WEBCAMS_PAGE,
  FEATURED_WEBCAMS,
} from "@/config/liveInfo";

type MainTab = "kart" | "webcams";
type MapSubTab = "nord" | "syd" | "interaktiv";

const MAIN_TABS = [
  { value: "kart", label: "Kart" },
  { value: "webcams", label: "Webcams" },
];

const MAP_TABS = [
  { value: "nord", label: "Nord" },
  { value: "syd", label: "Sør" },
  { value: "interaktiv", label: "Interaktiv" },
];

export const MapScreen: React.FC = () => {
  const [mainTab, setMainTab] = React.useState<MainTab>("kart");
  const [mapSubTab, setMapSubTab] = React.useState<MapSubTab>("nord");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const currentMap = MAPS[mapSubTab];

  return (
    <div className="flex flex-col h-[100dvh]">
      <AppHeader title="Live Info" subtitle="Davos Klosters" />

      {/* Sticky segmented control */}
      <div className="sticky top-14 z-30 bg-background border-b border-border px-4 py-3 safe-area-top">
        <DavosSegmented
          options={MAIN_TABS}
          value={mainTab}
          onChange={(v) => setMainTab(v as MainTab)}
          className="w-full"
        />
      </div>

      {/* Scrollable content area */}
      <ScrollArea className="flex-1">
        <div className="pb-24">

          {/* KART TAB */}
          {mainTab === "kart" && (
            <div className="p-4">
              {/* Map sub-tabs */}
              <div className="mb-4">
                <DavosSegmented
                  options={MAP_TABS}
                  value={mapSubTab}
                  onChange={(v) => setMapSubTab(v as MapSubTab)}
                  className="w-full"
                />
              </div>

              {/* Map info */}
              <div className="mb-4 flex items-start justify-between">
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

              {/* Map embed */}
              <DavosWebEmbed
                title={currentMap.title}
                url={currentMap.url}
                height="calc(100dvh - 320px)"
              />
            </div>
          )}

          {/* WEBCAMS TAB */}
          {mainTab === "webcams" && (
            <div className="p-4">
              {/* Featured webcams */}
              <div className="mb-6">
                <h2 className="font-heading text-lg font-semibold text-foreground mb-1">
                  Featured webcams
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Live-bilder fra fjellområdene
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {FEATURED_WEBCAMS.map((webcam) => (
                    <WebcamCard key={webcam.id} webcam={webcam} />
                  ))}
                </div>
              </div>

              {/* All webcams embed */}
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground mb-1">
                  Alle webcams
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Fullstendig oversikt over alle kameraer
                </p>
                <DavosWebEmbed
                  title={WEBCAMS_PAGE.title}
                  url={WEBCAMS_PAGE.url}
                  height="60vh"
                />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

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
