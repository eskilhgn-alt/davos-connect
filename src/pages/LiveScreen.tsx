/**
 * LiveScreen - Windy Radar + Webcam thumbnails
 * Primary live content view for the app
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { WindyEmbed } from "@/components/live";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { WEBCAMS, type Webcam } from "@/config/webcams";
import { Mountain } from "lucide-react";
import { Link } from "react-router-dom";
import { WebcamModal } from "@/components/webcams";
import { useGeolocation } from "@/hooks/useGeolocation";

export const LiveScreen: React.FC = () => {
  const { position } = useGeolocation();
  const [selectedWebcam, setSelectedWebcam] = React.useState<Webcam | null>(null);


  // Show first 6 webcams
  const displayedWebcams = WEBCAMS.slice(0, 6);

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader 
        title="Live" 
        subtitle="Radar & webcams"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

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
            <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3">
              Live værradar
            </h2>
            
            <WindyEmbed className="h-[350px]" overlay="radar" lat={position?.lat} lon={position?.lon} />
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Animert nedbørradar · Oppdatert {new Date().toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
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
                return (
                  <button
                    key={webcam.id}
                    onClick={() => setSelectedWebcam(webcam)}
                    className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-[var(--radius-card)] active:scale-[0.98] transition-transform"
                  >
                    <DavosCard className="overflow-hidden">
                      <div className="relative aspect-video bg-muted">
                        {webcam.videoUrl ? (
                          <>
                            <iframe
                              src={webcam.videoUrl}
                              className="w-full h-full border-0 pointer-events-none"
                              allow="autoplay"
                              sandbox="allow-scripts allow-same-origin allow-presentation"
                              title={`${webcam.name} live`}
                              loading="lazy"
                            />
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded flex items-center gap-1">
                              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                              LIVE
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Mountain className="h-8 w-8 text-muted-foreground/50" />
                          </div>
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
