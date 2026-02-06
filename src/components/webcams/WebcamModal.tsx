/**
 * WebcamModal - Fullscreen webcam viewer with swipe navigation
 * 
 * - Shows snapshot instantly, auto-switches to video when ready
 * - Swipe left/right to navigate between webcams
 * - Uses preloaded iframes via DOM reparenting for instant video
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { X, ExternalLink, RefreshCw, Image, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";
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
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [showVideo, setShowVideo] = React.useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);
  const [freshIframeReady, setFreshIframeReady] = React.useState(false);

  const videoSlotRef = React.useRef<HTMLDivElement>(null);
  const originalParentRef = React.useRef<HTMLElement | null>(null);
  const reparentedContainerRef = React.useRef<HTMLDivElement | null>(null);
  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Swipe tracking
  const touchStartRef = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const swipeContainerRef = React.useRef<HTMLDivElement>(null);

  const { getIframeContainer, isPreloaded } = useWebcamPreload();

  const currentWebcam = React.useMemo(() => WEBCAMS[currentIndex] ?? null, [currentIndex]);

  // Set initial index when webcam prop changes
  React.useEffect(() => {
    if (open && webcam) {
      const idx = WEBCAMS.findIndex(w => w.id === webcam.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
    }
  }, [open, webcam]);

  // Cleanup reparented iframe
  const returnIframe = React.useCallback(() => {
    if (reparentedContainerRef.current && originalParentRef.current) {
      const c = reparentedContainerRef.current;
      c.style.cssText = "width:1px;height:1px;overflow:hidden;position:absolute;left:-9999px;";
      originalParentRef.current.appendChild(c);
      reparentedContainerRef.current = null;
      originalParentRef.current = null;
    }
  }, []);

  // Setup video for current webcam
  const setupWebcam = React.useCallback((cam: Webcam) => {
    // Return previous iframe first
    returnIframe();

    setSnapshotLoaded(false);
    setSnapshotKey(Date.now());
    setFreshIframeReady(false);

    const preloaded = isPreloaded(cam.id);
    const container = getIframeContainer(cam.id);

    if (preloaded && container && videoSlotRef.current) {
      originalParentRef.current = container.parentElement;
      reparentedContainerRef.current = container;
      container.style.cssText = "width:100%;height:100%;position:absolute;inset:0;";
      const iframe = container.querySelector("iframe");
      if (iframe) iframe.style.cssText = "width:100%;height:100%;border:0;";
      videoSlotRef.current.appendChild(container);
      setShowVideo(true);
    } else {
      setShowVideo(false);
    }
  }, [isPreloaded, getIframeContainer, returnIframe]);

  // On open or index change
  React.useEffect(() => {
    if (open && currentWebcam) {
      setupWebcam(currentWebcam);
    }
    return () => {
      returnIframe();
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, currentIndex, currentWebcam, setupWebcam, returnIframe]);

  // Auto-refresh snapshot
  React.useEffect(() => {
    if (open && !showVideo) {
      refreshIntervalRef.current = setInterval(() => setSnapshotKey(Date.now()), 8000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, showVideo]);

  // Fresh iframe auto-switch
  const handleFreshIframeLoad = React.useCallback(() => {
    setFreshIframeReady(true);
    setTimeout(() => setShowVideo(true), 100);
  }, []);

  // Navigation
  const goNext = React.useCallback(() => {
    setCurrentIndex(i => (i + 1) % WEBCAMS.length);
  }, []);

  const goPrev = React.useCallback(() => {
    setCurrentIndex(i => (i - 1 + WEBCAMS.length) % WEBCAMS.length);
  }, []);

  // Touch/swipe handlers
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.t;
    touchStartRef.current = null;

    // Require horizontal swipe: |dx| > 50px, |dx| > |dy|, < 500ms
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 500) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  const handleSwitchToSnapshot = () => {
    setShowVideo(false);
    setSnapshotKey(Date.now());
  };

  const handleOpenExternal = () => {
    const url = currentWebcam?.externalUrl || currentWebcam?.videoUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!currentWebcam || !open) return null;

  const snapshotUrl = `${getWebcamProxyUrl(currentWebcam.snapshotUrl)}&t=${snapshotKey}`;
  const hasVideo = !!currentWebcam.videoUrl;
  const preloaded = isPreloaded(currentWebcam.id);
  const needsFreshIframe = hasVideo && !preloaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="fixed inset-0 w-screen h-[100dvh] max-w-none max-h-none p-0 m-0 rounded-none border-none bg-black overflow-hidden"
        style={{ transform: 'none', left: 0, top: 0 }}
      >
        {/* Swipe area */}
        <div
          ref={swipeContainerRef}
          className="absolute inset-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Top overlay */}
          <div 
            className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
          >
            <div className="text-white min-w-0 flex-1 pr-4">
              <h2 className="font-heading text-lg font-semibold truncate">{currentWebcam.area}</h2>
              <p className="text-sm text-white/70 truncate">
                {currentWebcam.name}{currentWebcam.elevation && ` · ${currentWebcam.elevation} m`}
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

          {/* Live badge + counter */}
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

          {/* Navigation arrows (desktop) */}
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white/70 hover:text-white hover:bg-black/60 transition-colors hidden sm:flex"
            aria-label="Forrige kamera"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/40 backdrop-blur-sm rounded-full text-white/70 hover:text-white hover:bg-black/60 transition-colors hidden sm:flex"
            aria-label="Neste kamera"
          >
            <ChevronRight size={24} />
          </button>

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
                alt={`${currentWebcam.name} - ${currentWebcam.area}`}
                className={cn("max-w-full max-h-full object-contain", !snapshotLoaded && "invisible")}
                onLoad={() => setSnapshotLoaded(true)}
                onError={() => setSnapshotLoaded(true)}
              />
            </div>

            {/* Video layer */}
            <div
              ref={videoSlotRef}
              className={cn(
                "absolute inset-0 transition-opacity duration-300",
                showVideo ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            >
              {needsFreshIframe && currentWebcam.videoUrl && (
                <iframe
                  src={currentWebcam.videoUrl}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  referrerPolicy="no-referrer-when-downgrade"
                  onLoad={handleFreshIframeLoad}
                  title={`${currentWebcam.name} live`}
                />
              )}
            </div>
          </div>

          {/* Bottom controls */}
          <div 
            className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 p-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            {/* Dot indicators */}
            <div className="flex items-center gap-1.5">
              {WEBCAMS.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "rounded-full transition-all",
                    i === currentIndex 
                      ? "w-2 h-2 bg-white" 
                      : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"
                  )}
                  aria-label={`Gå til ${w.area}`}
                />
              ))}
            </div>

            {/* Snapshot toggle */}
            {showVideo && (
              <button onClick={handleSwitchToSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full hover:bg-white/30 transition-colors">
                <Image size={14} />
                Stillbilde
              </button>
            )}

            {/* Swipe hint (mobile only) */}
            <p className="text-[10px] text-white/30 sm:hidden">Sveip for å bytte kamera</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WebcamModal;
