/**
 * LiveScreen - Windy Radar + Webcam thumbnails
 * Primary live content view for the app
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { WindyEmbed } from "@/components/live";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { Mountain, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { WebcamModal } from "@/components/webcams";

export const LiveScreen: React.FC = () => {
  const [webcamErrors, setWebcamErrors] = React.useState<Set<string>>(new Set());
  const [selectedWebcam, setSelectedWebcam] = React.useState<Webcam | null>(null);

  const handleWebcamError = (webcamId: string) => {
    setWebcamErrors(prev => new Set([...prev, webcamId]));
  };

  const handleOpenWindy = () => {
    window.open("https://www.windy.com/nb/-V%C3%A6rradar-radar?radar,46.8,9.83,10", "_blank");
  };

  // Show first 6 webcams
  const displayedWebcams = WEBCAMS.slice(0, 6);

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
            
            <WindyEmbed className="h-[350px]" overlay="radar" />
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Animert nedbørradar fra Windy.com
            </p>
          </section>

          {/* Webcams Section */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Webcams
              </h2>
              <Link 
                to="/webcams"
                className="text-xs text-primary hover:underline"
              >
                Alle ({WEBCAMS.length})
              </Link>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {displayedWebcams.map((webcam) => {
                const hasError = webcamErrors.has(webcam.id);
                const proxyUrl = `${getWebcamProxyUrl(webcam.snapshotUrl)}&t=${Date.now()}`;
                
                return (
                  <button
                    key={webcam.id}
                    onClick={() => setSelectedWebcam(webcam)}
                    className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-[var(--radius-card)] active:scale-[0.98] transition-transform"
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
                            {/* Live badge */}
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded">
                              LIVE
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

      {/* Fullscreen modal */}
      <WebcamModal
        webcam={selectedWebcam}
        open={!!selectedWebcam}
        onOpenChange={(open) => !open && setSelectedWebcam(null)}
      />
    </div>
  );
};

export default LiveScreen;
