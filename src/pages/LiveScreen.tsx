/**
 * LiveScreen - Radar, Windy Weather & Webcams hub
 * Primary live content view for the app
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { RainViewerRadar, WindyEmbed, DavosWebEmbed } from "@/components/live";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSegmented } from "@/components/ui/davos-segmented";
import { WEBCAMS, getWebcamProxyUrl } from "@/config/webcams";
import { X, RefreshCw, Mountain, Video, Image, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface WebcamModalState {
  isOpen: boolean;
  webcam: typeof WEBCAMS[0] | null;
  mode: "video" | "snapshot";
}

type RadarTab = "rainviewer" | "windy";

export const LiveScreen: React.FC = () => {
  const [radarTab, setRadarTab] = React.useState<RadarTab>("rainviewer");
  const [webcamModal, setWebcamModal] = React.useState<WebcamModalState>({
    isOpen: false,
    webcam: null,
    mode: "video",
  });
  const [webcamErrors, setWebcamErrors] = React.useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Auto-refresh webcam snapshot in modal every 2 seconds
  const modalRefreshRef = React.useRef<number | null>(null);
  
  React.useEffect(() => {
    if (webcamModal.isOpen && webcamModal.webcam && webcamModal.mode === "snapshot") {
      modalRefreshRef.current = window.setInterval(() => {
        setRefreshKey(k => k + 1);
      }, 2000);
    } else if (modalRefreshRef.current) {
      clearInterval(modalRefreshRef.current);
      modalRefreshRef.current = null;
    }
    
    return () => {
      if (modalRefreshRef.current) {
        clearInterval(modalRefreshRef.current);
      }
    };
  }, [webcamModal.isOpen, webcamModal.webcam, webcamModal.mode]);

  const handleWebcamClick = (webcam: typeof WEBCAMS[0]) => {
    // Default to video mode if available
    setWebcamModal({ 
      isOpen: true, 
      webcam,
      mode: webcam.videoUrl ? "video" : "snapshot"
    });
    setRefreshKey(0);
  };

  const handleWebcamError = (webcamId: string) => {
    setWebcamErrors(prev => new Set([...prev, webcamId]));
  };

  const handleCloseModal = () => {
    setWebcamModal({ isOpen: false, webcam: null, mode: "video" });
  };

  const handleOpenExternal = () => {
    if (webcamModal.webcam?.videoUrl) {
      window.open(webcamModal.webcam.videoUrl, "_blank");
    }
  };

  const toggleModalMode = () => {
    setWebcamModal(prev => ({
      ...prev,
      mode: prev.mode === "video" ? "snapshot" : "video"
    }));
  };

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Live" subtitle="Radar, vær & webcams" />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-4 space-y-6">
          {/* Radar Section with tabs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Værradar
              </h2>
              <DavosSegmented
                value={radarTab}
                onChange={(v) => setRadarTab(v as RadarTab)}
                options={[
                  { value: "rainviewer", label: "Nedbør" },
                  { value: "windy", label: "Vind" },
                ]}
              />
            </div>
            
            {radarTab === "rainviewer" ? (
              <RainViewerRadar className="h-[300px]" />
            ) : (
              <WindyEmbed className="h-[300px]" overlay="wind" />
            )}
          </section>

          {/* Webcams Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Webcams ({WEBCAMS.length})
              </h2>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Video size={12} />
                Trykk for live
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {WEBCAMS.map((webcam) => {
                const hasError = webcamErrors.has(webcam.id);
                const proxyUrl = getWebcamProxyUrl(webcam.imageUrl);
                
                return (
                  <button
                    key={webcam.id}
                    onClick={() => handleWebcamClick(webcam)}
                    className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-[var(--radius-card)]"
                  >
                    <DavosCard className="overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        {hasError ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Mountain className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        ) : (
                          <>
                            <img
                              src={proxyUrl}
                              alt={`${webcam.name} - ${webcam.area}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={() => handleWebcamError(webcam.id)}
                            />
                            {/* Video indicator */}
                            {webcam.videoUrl && (
                              <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                                <Video size={10} />
                                <span>Live</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <DavosCardContent className="p-2">
                        <p className="text-xs font-medium text-foreground truncate">
                          {webcam.area}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {webcam.name}
                          {webcam.elevation && ` · ${webcam.elevation}m`}
                        </p>
                      </DavosCardContent>
                    </DavosCard>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Fullscreen Webcam Modal */}
      <Dialog open={webcamModal.isOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] p-0 rounded-none bg-black border-none">
          {webcamModal.webcam && (
            <div className="relative w-full h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 bg-black/80 backdrop-blur-sm z-10">
                <div>
                  <h2 className="font-heading text-lg text-white">
                    {webcamModal.webcam.area}
                  </h2>
                  <p className="text-sm text-white/70">
                    {webcamModal.webcam.name}
                    {webcamModal.webcam.elevation && ` · ${webcamModal.webcam.elevation}m`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Mode toggle */}
                  {webcamModal.webcam.videoUrl && (
                    <button
                      onClick={toggleModalMode}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      {webcamModal.mode === "video" ? (
                        <>
                          <Image size={14} />
                          Bilde
                        </>
                      ) : (
                        <>
                          <Video size={14} />
                          Video
                        </>
                      )}
                    </button>
                  )}
                  {/* Open external */}
                  {webcamModal.webcam.videoUrl && (
                    <button
                      onClick={handleOpenExternal}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                      aria-label="Åpne ekstern"
                    >
                      <ExternalLink className="h-4 w-4 text-white" />
                    </button>
                  )}
                  {/* Live indicator for snapshot mode */}
                  {webcamModal.mode === "snapshot" && (
                    <div className="flex items-center gap-1.5 text-white/70">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Live</span>
                    </div>
                  )}
                  <button
                    onClick={handleCloseModal}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    aria-label="Lukk"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 flex items-center justify-center">
                {webcamModal.mode === "video" && webcamModal.webcam.videoUrl ? (
                  <DavosWebEmbed
                    url={webcamModal.webcam.videoUrl}
                    title={`${webcamModal.webcam.name} - ${webcamModal.webcam.area}`}
                    className="w-full h-full"
                    allowAutoplay
                  />
                ) : (
                  <div className="p-4 w-full h-full flex items-center justify-center">
                    <img
                      key={refreshKey}
                      src={`${getWebcamProxyUrl(webcamModal.webcam.imageUrl)}&t=${refreshKey}`}
                      alt={`${webcamModal.webcam.name} - ${webcamModal.webcam.area}`}
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveScreen;
