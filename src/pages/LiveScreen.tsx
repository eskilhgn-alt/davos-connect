/**
 * LiveScreen - Radar + Webcams hub
 * Primary live content view for the app
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { RainViewerRadar } from "@/components/live/RainViewerRadar";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { WEBCAMS, getWebcamProxyUrl } from "@/config/webcams";
import { X, RefreshCw, Mountain } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface WebcamModalState {
  isOpen: boolean;
  webcam: typeof WEBCAMS[0] | null;
}

export const LiveScreen: React.FC = () => {
  const [webcamModal, setWebcamModal] = React.useState<WebcamModalState>({
    isOpen: false,
    webcam: null,
  });
  const [webcamErrors, setWebcamErrors] = React.useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Auto-refresh webcam in modal every 2 seconds
  const modalRefreshRef = React.useRef<number | null>(null);
  
  React.useEffect(() => {
    if (webcamModal.isOpen && webcamModal.webcam) {
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
  }, [webcamModal.isOpen, webcamModal.webcam]);

  const handleWebcamClick = (webcam: typeof WEBCAMS[0]) => {
    setWebcamModal({ isOpen: true, webcam });
    setRefreshKey(0);
  };

  const handleWebcamError = (webcamId: string) => {
    setWebcamErrors(prev => new Set([...prev, webcamId]));
  };

  const handleCloseModal = () => {
    setWebcamModal({ isOpen: false, webcam: null });
  };

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Live" subtitle="Radar & Webcams" />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-4 space-y-6">
          {/* Radar Section */}
          <section>
            <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3">
              Værradar
            </h2>
            <RainViewerRadar className="h-[280px]" />
          </section>

          {/* Webcams Section */}
          <section>
            <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3">
              Webcams ({WEBCAMS.length})
            </h2>
            
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
                          <img
                            src={proxyUrl}
                            alt={`${webcam.name} - ${webcam.area}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={() => handleWebcamError(webcam.id)}
                          />
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
                  <div className="flex items-center gap-1.5 text-white/70">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span className="text-xs">Live</span>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                    aria-label="Lukk"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>
              
              {/* Image */}
              <div className="flex-1 flex items-center justify-center p-4">
                <img
                  key={refreshKey}
                  src={`${getWebcamProxyUrl(webcamModal.webcam.imageUrl)}&t=${refreshKey}`}
                  alt={`${webcamModal.webcam.name} - ${webcamModal.webcam.area}`}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveScreen;
