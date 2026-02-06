/**
 * WebcamModal - Fullscreen webcam viewer
 * 
 * Uses preloaded iframes: when a webcam is opened, its iframe container
 * is moved from the hidden preload host into the modal (DOM reparenting).
 * This means the video is ALREADY playing — zero wait time.
 * 
 * Falls back to fresh iframe + snapshot for non-preloaded webcams.
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { X, ExternalLink, RefreshCw, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { useWebcamPreload } from "@/components/webcams/useWebcamPreload";

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
  const [showVideo, setShowVideo] = React.useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);
  const [freshIframeReady, setFreshIframeReady] = React.useState(false);

  const videoSlotRef = React.useRef<HTMLDivElement>(null);
  const originalParentRef = React.useRef<HTMLElement | null>(null);
  const reparentedContainerRef = React.useRef<HTMLDivElement | null>(null);
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const { getIframeContainer, isPreloaded } = useWebcamPreload();

  // On open: reparent preloaded iframe into modal, or mount fresh one
  React.useEffect(() => {
    if (!open || !webcam) return;

    setSnapshotLoaded(false);
    setSnapshotKey(Date.now());
    setFreshIframeReady(false);

    const preloaded = isPreloaded(webcam.id);
    const container = getIframeContainer(webcam.id);

    if (preloaded && container && videoSlotRef.current) {
      // Reparent: move the already-playing iframe into our modal
      originalParentRef.current = container.parentElement;
      reparentedContainerRef.current = container;

      // Make it full-size
      container.style.cssText = "width:100%;height:100%;position:absolute;inset:0;";
      const iframe = container.querySelector("iframe");
      if (iframe) {
        iframe.style.cssText = "width:100%;height:100%;border:0;";
      }

      videoSlotRef.current.appendChild(container);
      setShowVideo(true);
    } else if (webcam.videoUrl) {
      // Not preloaded: show snapshot first, load fresh iframe
      setShowVideo(false);
    } else {
      setShowVideo(false);
    }

    return () => {
      // Return reparented iframe back to hidden host
      if (reparentedContainerRef.current && originalParentRef.current) {
        const c = reparentedContainerRef.current;
        c.style.cssText = "width:1px;height:1px;overflow:hidden;position:absolute;left:-9999px;";
        originalParentRef.current.appendChild(c);
        reparentedContainerRef.current = null;
        originalParentRef.current = null;
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, webcam, isPreloaded, getIframeContainer]);

  // Auto-refresh snapshot every 8s when visible
  React.useEffect(() => {
    if (open && !showVideo) {
      refreshIntervalRef.current = setInterval(() => {
        setSnapshotKey(Date.now());
      }, 8000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, showVideo]);

  // Fresh iframe loaded → auto-switch
  const handleFreshIframeLoad = React.useCallback(() => {
    setFreshIframeReady(true);
    setTimeout(() => setShowVideo(true), 100);
  }, []);

  const handleSwitchToSnapshot = () => {
    setShowVideo(false);
    setSnapshotKey(Date.now());
  };

  const handleOpenExternal = () => {
    const url = webcam?.externalUrl || webcam?.videoUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!webcam) return null;

  const snapshotUrl = `${getWebcamProxyUrl(webcam.snapshotUrl)}&t=${snapshotKey}`;
  const hasVideo = !!webcam.videoUrl;
  const preloaded = isPreloaded(webcam.id);
  const needsFreshIframe = hasVideo && !preloaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="fixed inset-0 w-screen h-[100dvh] max-w-none max-h-none p-0 m-0 rounded-none border-none bg-black overflow-hidden"
        style={{ transform: 'none', left: 0, top: 0 }}
      >
        {/* Top overlay */}
        <div 
          className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
        >
          <div className="text-white min-w-0 flex-1 pr-4">
            <h2 className="font-heading text-lg font-semibold truncate">{webcam.area}</h2>
            <p className="text-sm text-white/70 truncate">
              {webcam.name}{webcam.elevation && ` · ${webcam.elevation} m`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DavosButton variant="ghost" size="icon" onClick={handleOpenExternal} className="text-white/60 hover:text-white hover:bg-white/10" aria-label="Åpne eksternt">
              <ExternalLink size={18} />
            </DavosButton>
            <DavosButton variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="text-white hover:text-white hover:bg-white/10" aria-label="Lukk">
              <X size={24} />
            </DavosButton>
          </div>
        </div>

        {/* Live badge */}
        <div className="absolute z-20 flex items-center gap-2" style={{ top: 'calc(max(env(safe-area-inset-top), 16px) + 72px)', left: '16px' }}>
          <span className="px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
          {!showVideo && (
            <span className="px-2 py-1 bg-black/60 text-white/80 text-xs rounded flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
              Oppdateres
            </span>
          )}
        </div>

        {/* Content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Snapshot layer */}
          <div className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-300",
            showVideo ? "opacity-0 pointer-events-none" : "opacity-100"
          )}>
            {!snapshotLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <img
              src={snapshotUrl}
              alt={`${webcam.name} - ${webcam.area}`}
              className={cn("max-w-full max-h-full object-contain", !snapshotLoaded && "invisible")}
              onLoad={() => setSnapshotLoaded(true)}
              onError={() => setSnapshotLoaded(true)}
            />
          </div>

          {/* Video layer - either reparented preloaded iframe or fresh */}
          <div
            ref={videoSlotRef}
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              showVideo ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            {/* Fresh iframe for non-preloaded webcams */}
            {needsFreshIframe && webcam.videoUrl && (
              <iframe
                src={webcam.videoUrl}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={handleFreshIframeLoad}
                title={`${webcam.name} live`}
              />
            )}
          </div>
        </div>

        {/* Bottom: switch back to snapshot */}
        {showVideo && (
          <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center p-4 bg-gradient-to-t from-black/60 to-transparent"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
            <button onClick={handleSwitchToSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full hover:bg-white/30 transition-colors">
              <Image size={14} />
              Bytt til stillbilde
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WebcamModal;
