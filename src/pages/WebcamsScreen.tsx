import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { cn } from "@/lib/utils";
import { Camera, RefreshCw, ImageOff, Mountain } from "lucide-react";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { WebcamModal } from "@/components/webcams";

interface WebcamCardProps {
  webcam: Webcam;
  onSelect: (webcam: Webcam) => void;
}

const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, onSelect }) => {
  const [imageState, setImageState] = React.useState<"loading" | "loaded" | "error">("loading");
  const [refreshKey, setRefreshKey] = React.useState(0);

  const imageUrl = `${getWebcamProxyUrl(webcam.snapshotUrl)}&t=${refreshKey}`;

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
        "w-full overflow-hidden rounded-xl bg-muted text-left",
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
      <div className="px-3 py-2">
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

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Webcams"
        subtitle="Davos Klosters"
        leftAction={<BackButton fallbackPath="/hjem" />}
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
            Trykk på et bilde for fullskjermvisning med auto-oppdatering.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {WEBCAMS.map((webcam) => (
              <WebcamCard 
                key={webcam.id} 
                webcam={webcam} 
                onSelect={setSelectedWebcam}
              />
            ))}
          </div>
        </div>
      </div>

      <WebcamModal
        webcam={selectedWebcam}
        open={!!selectedWebcam}
        onOpenChange={(open) => !open && setSelectedWebcam(null)}
      />
    </div>
  );
};

export default WebcamsScreen;
