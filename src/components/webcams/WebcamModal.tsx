/**
 * WebcamModal - Internal fullscreen webcam viewer
 * Shows pseudo-live webcam with auto-refresh capability
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { RefreshCw, X, ExternalLink, Mountain } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";

interface WebcamModalProps {
  webcam: Webcam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WebcamModal: React.FC<WebcamModalProps> = ({
  webcam,
  open,
  onOpenChange,
}) => {
  const [imageState, setImageState] = React.useState<"loading" | "loaded" | "error">("loading");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isAutoRefresh, setIsAutoRefresh] = React.useState(false);

  // Reset state when webcam changes
  React.useEffect(() => {
    if (webcam && open) {
      setImageState("loading");
      setRefreshKey((k) => k + 1);
    }
  }, [webcam, open]);

  // Auto-refresh every 30 seconds when enabled
  React.useEffect(() => {
    if (!open || !isAutoRefresh) return;

    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setImageState("loading");
    }, 30000);

    return () => clearInterval(interval);
  }, [open, isAutoRefresh]);

  const handleManualRefresh = () => {
    setImageState("loading");
    setRefreshKey((k) => k + 1);
  };

  const handleOpenExternal = () => {
    if (webcam?.videoUrl) {
      window.open(webcam.videoUrl, "_blank");
    }
  };

  if (!webcam) return null;

  const imageUrl = `${getWebcamProxyUrl(webcam.imageUrl)}&t=${refreshKey}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] p-0 rounded-none bg-black border-none">
        {/* Header overlay */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent safe-area-top">
          <div className="text-white min-w-0 flex-1 pr-2">
            <h2 className="font-heading text-lg font-semibold truncate">
              {webcam.area}
            </h2>
            <p className="text-sm text-white/70 truncate">
              {webcam.name}
              {webcam.elevation && ` · ${webcam.elevation} m`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DavosButton
              variant={isAutoRefresh ? "primary" : "ghost"}
              size="icon"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={cn(
                "text-white hover:text-white",
                isAutoRefresh && "bg-accent text-accent-foreground hover:bg-accent/90"
              )}
              aria-label={isAutoRefresh ? "Stopp auto-oppdatering" : "Start auto-oppdatering"}
            >
              <RefreshCw size={20} className={cn(isAutoRefresh && "animate-spin")} />
            </DavosButton>
            <DavosButton
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:text-white"
              aria-label="Lukk"
            >
              <X size={24} />
            </DavosButton>
          </div>
        </div>

        {/* Live badge */}
        <div className="absolute top-20 left-4 z-10 flex items-center gap-2 safe-area-top">
          <span className="px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded">
            LIVE
            {isAutoRefresh && <span className="ml-1">· Auto</span>}
          </span>
        </div>

        {/* Image container */}
        <div className="w-full h-full flex items-center justify-center">
          {imageState === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <DavosSkeleton variant="rectangular" className="w-full h-full" />
            </div>
          )}

          {imageState === "error" && (
            <div className="flex flex-col items-center justify-center text-white/70 gap-4">
              <Mountain className="h-16 w-16" />
              <p className="text-sm">Kunne ikke laste bilde</p>
              <DavosButton variant="ghost" onClick={handleManualRefresh}>
                <RefreshCw size={16} className="mr-2" />
                Prøv igjen
              </DavosButton>
            </div>
          )}

          <img
            src={imageUrl}
            alt={`${webcam.name} - ${webcam.area}`}
            className={cn(
              "max-w-full max-h-full object-contain",
              imageState !== "loaded" && "invisible"
            )}
            onLoad={() => setImageState("loaded")}
            onError={() => setImageState("error")}
          />
        </div>

        {/* Footer with external link */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent safe-area-bottom">
          {webcam.videoUrl && (
            <button
              onClick={handleOpenExternal}
              className="flex items-center gap-2 text-white/60 hover:text-white text-xs transition-colors"
            >
              <ExternalLink size={14} />
              Åpne live video eksternt
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WebcamModal;
