/**
 * WebcamModal - Fullscreen webcam viewer with video embed + snapshot fallback
 * Video-first approach with iframe embed, falls back to auto-refreshing snapshot
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { X, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWebcamProxyUrl, type Webcam } from "@/config/webcams";

interface WebcamModalProps {
  webcam: Webcam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "video" | "snapshot";

export const WebcamModal: React.FC<WebcamModalProps> = ({
  webcam,
  open,
  onOpenChange,
}) => {
  const [viewMode, setViewMode] = React.useState<ViewMode>("video");
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  const [iframeError, setIframeError] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);
  const [snapshotLoaded, setSnapshotLoaded] = React.useState(false);
  const [iframeKey, setIframeKey] = React.useState(0);
  
  const loadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when modal opens or webcam changes
  React.useEffect(() => {
    if (open && webcam) {
      // Determine initial view mode based on availability
      const hasVideo = !!webcam.videoUrl;
      setViewMode(hasVideo ? "video" : "snapshot");
      setIframeLoaded(false);
      setIframeError(false);
      setSnapshotLoaded(false);
      setSnapshotKey(Date.now());
      setIframeKey((k) => k + 1);

      // Set timeout for iframe load failure detection
      if (hasVideo) {
        loadTimeoutRef.current = setTimeout(() => {
          if (!iframeLoaded) {
            setIframeError(true);
          }
        }, 6000);
      }
    }

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [open, webcam]);

  // Auto-refresh snapshot every 10 seconds when in snapshot mode
  React.useEffect(() => {
    if (open && viewMode === "snapshot") {
      refreshIntervalRef.current = setInterval(() => {
        setSnapshotKey(Date.now());
        setSnapshotLoaded(false);
      }, 10000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, viewMode]);

  // Cleanup on close
  React.useEffect(() => {
    if (!open) {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }
  }, [open]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  const handleOpenExternal = () => {
    const url = webcam?.externalUrl || webcam?.videoUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleSwitchToSnapshot = () => {
    setViewMode("snapshot");
    setSnapshotKey(Date.now());
  };

  if (!webcam) return null;

  const snapshotUrl = `${getWebcamProxyUrl(webcam.snapshotUrl)}&t=${snapshotKey}`;
  const showIframe = viewMode === "video" && webcam.videoUrl && !iframeError;
  const showSnapshot = viewMode === "snapshot" || iframeError || !webcam.videoUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="fixed inset-0 w-screen h-[100dvh] max-w-none max-h-none p-0 m-0 rounded-none border-none bg-black overflow-hidden"
        style={{ transform: 'none', left: 0, top: 0 }}
      >
        {/* Top overlay with controls */}
        <div 
          className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
        >
          <div className="text-white min-w-0 flex-1 pr-4">
            <h2 className="font-heading text-lg font-semibold truncate">
              {webcam.area}
            </h2>
            <p className="text-sm text-white/70 truncate">
              {webcam.name}
              {webcam.elevation && ` · ${webcam.elevation} m`}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* External link - secondary/subtle */}
            <DavosButton
              variant="ghost"
              size="icon"
              onClick={handleOpenExternal}
              className="text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Åpne eksternt"
            >
              <ExternalLink size={18} />
            </DavosButton>
            
            {/* Close button */}
            <DavosButton
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-white hover:text-white hover:bg-white/10"
              aria-label="Lukk"
            >
              <X size={24} />
            </DavosButton>
          </div>
        </div>

        {/* Live badge */}
        <div 
          className="absolute z-20 flex items-center gap-2"
          style={{ 
            top: 'calc(max(env(safe-area-inset-top), 16px) + 72px)',
            left: '16px' 
          }}
        >
          <span className="px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
          {showSnapshot && (
            <span className="px-2 py-1 bg-black/60 text-white/80 text-xs rounded flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
              Oppdateres
            </span>
          )}
        </div>

        {/* Content container - fullscreen */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Video iframe */}
          {showIframe && webcam.videoUrl && (
            <>
              {/* Loading overlay */}
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
                  <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
                  <p className="text-white/70 text-sm">Laster live video…</p>
                </div>
              )}
              
              <iframe
                key={iframeKey}
                src={webcam.videoUrl}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={handleIframeLoad}
                title={`${webcam.name} - ${webcam.area} live video`}
              />
            </>
          )}

          {/* Snapshot fallback with error state for failed iframe */}
          {showSnapshot && (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Error message if iframe failed */}
              {iframeError && (
                <div className="absolute top-1/4 left-0 right-0 z-10 flex flex-col items-center gap-3 px-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/20 border border-amber-500/40 rounded-lg">
                    <AlertCircle size={16} className="text-amber-400" />
                    <span className="text-amber-200 text-sm">Live video utilgjengelig</span>
                  </div>
                  <button
                    onClick={handleOpenExternal}
                    className="text-xs text-white/60 hover:text-white underline"
                  >
                    Prøv å åpne eksternt
                  </button>
                </div>
              )}

              {/* Snapshot loading state */}
              {!snapshotLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}

              <img
                src={snapshotUrl}
                alt={`${webcam.name} - ${webcam.area}`}
                className={cn(
                  "max-w-full max-h-full object-contain",
                  !snapshotLoaded && "invisible"
                )}
                onLoad={() => setSnapshotLoaded(true)}
                onError={() => setSnapshotLoaded(true)} // Show even if error to avoid infinite loading
              />
            </div>
          )}
        </div>

        {/* Bottom info bar - only for video mode with fallback option */}
        {viewMode === "video" && iframeLoaded && (
          <div 
            className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center p-4 bg-gradient-to-t from-black/60 to-transparent"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            <button
              onClick={handleSwitchToSnapshot}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              Bytt til stillbilde
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WebcamModal;
