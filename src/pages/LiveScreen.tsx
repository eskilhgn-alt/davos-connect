/**
 * LiveScreen - Windy Radar + Webcam thumbnails
 * Primary live content view for the app
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { WindyEmbed } from "@/components/live";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { WEBCAMS, getWebcamProxyUrl } from "@/config/webcams";
import { Mountain, ExternalLink, Play } from "lucide-react";

export const LiveScreen: React.FC = () => {
  const [webcamErrors, setWebcamErrors] = React.useState<Set<string>>(new Set());

  const handleWebcamError = (webcamId: string) => {
    setWebcamErrors(prev => new Set([...prev, webcamId]));
  };

  const handleOpenWebcam = (webcam: typeof WEBCAMS[0]) => {
    // Open Feratel video player in external browser
    if (webcam.videoUrl) {
      window.open(webcam.videoUrl, "_blank");
    }
  };

  const handleOpenWindy = () => {
    window.open("https://www.windy.com/nb/-V%C3%A6rradar-radar?radar,46.8,9.83,10", "_blank");
  };

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Live" subtitle="Radar & webcams" />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="p-4 space-y-6">
          {/* Windy Radar Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Live værradar – Davos
              </h2>
              <button 
                onClick={handleOpenWindy}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                Fullskjerm
              </button>
            </div>
            
            <WindyEmbed className="h-[350px]" overlay="rain" />
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Animert nedbørradar fra Windy.com
            </p>
          </section>

          {/* Webcams Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Webcams ({WEBCAMS.length})
              </h2>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Play size={12} />
                Trykk for live video
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {WEBCAMS.map((webcam) => {
                const hasError = webcamErrors.has(webcam.id);
                const proxyUrl = getWebcamProxyUrl(webcam.imageUrl);
                
                return (
                  <button
                    key={webcam.id}
                    onClick={() => handleOpenWebcam(webcam)}
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
                            {/* Play indicator */}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                              <div className="bg-white/90 rounded-full p-2">
                                <Play className="h-5 w-5 text-foreground fill-current" />
                              </div>
                            </div>
                            {/* External link badge */}
                            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                              <ExternalLink size={10} />
                            </div>
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
    </div>
  );
};

export default LiveScreen;
