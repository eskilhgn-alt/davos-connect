import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { cn } from "@/lib/utils";
import { Camera, RefreshCw, Maximize2, X, ImageOff, Mountain } from "lucide-react";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosButton } from "@/components/ui/davos-button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface WebcamCardProps {
  webcam: Webcam;
  onSelect: (webcam: Webcam) => void;
}

const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, onSelect }) => {
  const [imageState, setImageState] = React.useState<"loading" | "loaded" | "error">("loading");
  const [refreshKey, setRefreshKey] = React.useState(0);

  const imageUrl = `${getWebcamProxyUrl(webcam.imageUrl)}&t=${refreshKey}`;

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageState("loading");
    setRefreshKey(k => k + 1);
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(webcam)}
      className={cn(
        "w-full overflow-hidden rounded-xl bg-muted",
        "focus:outline-none focus:ring-2 focus:ring-primary",
        "active:scale-[0.98] transition-transform"
      )}
    >
      {/* Image */}
      <div className="relative aspect-video bg-muted">
        {imageState === "loading" && (
          <DavosSkeleton variant="rectangular" className="absolute inset-0" />
        )}
        
        {imageState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageOff size={32} />
            <span className="text-xs">Kunne ikke laste bilde</span>
          </div>
        )}

        <img
          src={imageUrl}
          alt={`${webcam.name} - ${webcam.area}`}
          loading="lazy"
          onLoad={() => setImageState("loaded")}
          onError={() => setImageState("error")}
          className={cn(
            "w-full h-full object-cover",
            imageState !== "loaded" && "invisible"
          )}
        />
        
        {/* Live badge */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded">
          LIVE
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={handleRefresh}
          className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-full hover:bg-background transition-colors"
          aria-label="Oppdater"
        >
          <RefreshCw size={14} className={cn(imageState === "loading" && "animate-spin")} />
        </button>
      </div>
      
      {/* Info */}
      <div className="px-3 py-2 text-left">
        <div className="flex items-center justify-between">
          <p className="font-heading text-sm font-semibold text-foreground">
            {webcam.area}
          </p>
          {webcam.elevation && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mountain size={12} />
              {webcam.elevation} m
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {webcam.name}
        </p>
      </div>
    </button>
  );
};

export const WebcamsScreen: React.FC = () => {
  const [selectedWebcam, setSelectedWebcam] = React.useState<Webcam | null>(null);
  const [fullscreenRefreshKey, setFullscreenRefreshKey] = React.useState(0);
  const [isAutoRefresh, setIsAutoRefresh] = React.useState(false);

  // Auto-refresh fullscreen image every 30 seconds
  React.useEffect(() => {
    if (!selectedWebcam || !isAutoRefresh) return;
    
    const interval = setInterval(() => {
      setFullscreenRefreshKey(k => k + 1);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [selectedWebcam, isAutoRefresh]);

  const handleOpenWebcam = (webcam: Webcam) => {
    setSelectedWebcam(webcam);
    setFullscreenRefreshKey(k => k + 1);
  };

  const fullscreenImageUrl = selectedWebcam 
    ? `${getWebcamProxyUrl(selectedWebcam.imageUrl)}&t=${fullscreenRefreshKey}`
    : "";

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Webcams"
        subtitle="Davos Klosters"
        rightAction={
          <Camera className="h-5 w-5 text-primary-foreground/70" />
        }
      />

      <div 
        className="flex-1 overflow-y-auto"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="p-4">
          <p className="text-sm text-muted-foreground mb-4">
            Live-bilder fra hele Davos Klosters-regionen. Trykk på et bilde for å se det i fullskjerm.
          </p>

          {/* Webcam grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WEBCAMS.map((webcam) => (
              <WebcamCard 
                key={webcam.id} 
                webcam={webcam} 
                onSelect={handleOpenWebcam}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Fullscreen webcam modal */}
      <Dialog open={!!selectedWebcam} onOpenChange={(open) => !open && setSelectedWebcam(null)}>
        <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] p-0 rounded-none bg-black">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="text-white">
              <h2 className="font-heading text-lg font-semibold">
                {selectedWebcam?.area}
              </h2>
              <p className="text-sm text-white/70">
                {selectedWebcam?.name}
                {selectedWebcam?.elevation && ` • ${selectedWebcam.elevation} m`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DavosButton
                variant={isAutoRefresh ? "primary" : "ghost"}
                size="icon"
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                className="text-white hover:text-white"
                aria-label={isAutoRefresh ? "Stopp auto-oppdatering" : "Start auto-oppdatering"}
              >
                <RefreshCw size={20} className={cn(isAutoRefresh && "animate-spin")} />
              </DavosButton>
              <DavosButton
                variant="ghost"
                size="icon"
                onClick={() => setSelectedWebcam(null)}
                className="text-white hover:text-white"
                aria-label="Lukk"
              >
                <X size={24} />
              </DavosButton>
            </div>
          </div>

          {/* Live badge */}
          <div className="absolute top-20 left-4 z-10 px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded">
            LIVE
            {isAutoRefresh && <span className="ml-1">• Auto</span>}
          </div>

          {/* Image */}
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={fullscreenImageUrl}
              alt={selectedWebcam ? `${selectedWebcam.name} - ${selectedWebcam.area}` : ""}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebcamsScreen;
