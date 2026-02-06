/**
 * WebcamModal - Fullscreen webcam viewer with swipe navigation
 * 
 * For preloaded webcams: renders controls as a fixed overlay directly 
 * on top of the preloaded iframe (no Dialog/overlay needed).
 * For non-preloaded: shows snapshot + fresh iframe.
 */

import * as React from "react";
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
  const [snapshotLoaded, setSnapshotLoaded] = React.useState(false);
  const [snapshotKey, setSnapshotKey] = React.useState(0);
  const [freshIframeReady, setFreshIframeReady] = React.useState(false);
  const [showSnapshot, setShowSnapshot] = React.useState(false);

  const refreshIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const { setActiveId, isPreloaded } = useWebcamPreload();
  const currentWebcam = WEBCAMS[currentIndex] ?? null;

  // Set initial index
  React.useEffect(() => {
    if (open && webcam) {
      const idx = WEBCAMS.findIndex(w => w.id === webcam.id);
      setCurrentIndex(idx >= 0 ? idx : 0);
      setShowSnapshot(false);
    }
    if (!open) {
      setActiveId(null);
    }
  }, [open, webcam, setActiveId]);

  // Activate preloaded iframe
  React.useEffect(() => {
    if (!open || !currentWebcam) {
      setActiveId(null);
      return;
    }

    const preloaded = isPreloaded(currentWebcam.id);
    setActiveId(preloaded && !showSnapshot ? currentWebcam.id : null);

    setSnapshotLoaded(false);
    setSnapshotKey(Date.now());
    setFreshIframeReady(false);
  }, [open, currentIndex, showSnapshot, currentWebcam, isPreloaded, setActiveId]);

  // Auto-refresh snapshot
  const videoActive = currentWebcam && isPreloaded(currentWebcam.id) && !showSnapshot;
  React.useEffect(() => {
    if (open && !videoActive) {
      refreshIntervalRef.current = setInterval(() => setSnapshotKey(Date.now()), 8000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [open, videoActive]);

  const handleFreshIframeLoad = React.useCallback(() => setFreshIframeReady(true), []);

  const goNext = React.useCallback(() => {
    setCurrentIndex(i => (i + 1) % WEBCAMS.length);
    setShowSnapshot(false);
  }, []);
  const goPrev = React.useCallback(() => {
    setCurrentIndex(i => (i - 1 + WEBCAMS.length) % WEBCAMS.length);
    setShowSnapshot(false);
  }, []);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, []);
  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.t;
    touchStartRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 500) {
      dx < 0 ? goNext() : goPrev();
    }
  }, [goNext, goPrev]);

  const handleClose = React.useCallback(() => {
    setActiveId(null);
    onOpenChange(false);
  }, [onOpenChange, setActiveId]);

  const handleOpenExternal = () => {
    const url = currentWebcam?.externalUrl || currentWebcam?.videoUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!open || !currentWebcam) return null;

  const snapshotUrl = `${getWebcamProxyUrl(currentWebcam.snapshotUrl)}&t=${snapshotKey}`;
  const preloaded = isPreloaded(currentWebcam.id);
  const showingPreloadedVideo = preloaded && !showSnapshot;
  const needsFreshIframe = !!currentWebcam.videoUrl && !preloaded && !showSnapshot;
  const showSnapshotLayer = !showingPreloadedVideo && !freshIframeReady;

  // Render as a plain fixed overlay — no Dialog overlay to block the iframe
  return (
    <div
      className="fixed inset-0 z-[51]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Black background (behind everything, only visible when showing snapshot/fresh) */}
      {!showingPreloadedVideo && (
        <div className="absolute inset-0 bg-black" />
      )}

      {/* Snapshot layer */}
      {showSnapshotLayer && (
        <div className="absolute inset-0 flex items-center justify-center z-[1]">
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
      )}

      {/* Fresh iframe for non-preloaded */}
      {needsFreshIframe && currentWebcam.videoUrl && (
        <div className={cn(
          "absolute inset-0 z-[2] transition-opacity duration-300",
          freshIframeReady ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <iframe
            src={currentWebcam.videoUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={handleFreshIframeLoad}
            title={`${currentWebcam.name} live`}
          />
        </div>
      )}

      {/* For preloaded video: the iframe is shown by PreloadProvider at z-45, 
          this overlay sits at z-50 but is transparent — controls float above */}

      {/* Top controls */}
      <div 
        className="absolute top-0 left-0 right-0 z-[5] flex items-start justify-between p-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent"
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
          <DavosButton variant="ghost" size="icon" onClick={handleClose} className="text-white hover:text-white hover:bg-white/10" aria-label="Lukk">
            <X size={24} />
          </DavosButton>
        </div>
      </div>

      {/* Live badge */}
      <div className="absolute z-[5] flex items-center gap-2" style={{ top: 'calc(max(env(safe-area-inset-top), 16px) + 72px)', left: '16px' }}>
        <span className="px-2 py-1 bg-destructive text-destructive-foreground text-xs font-medium rounded flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </span>
        {showSnapshotLayer && (
          <span className="px-2 py-1 bg-black/60 text-white/80 text-xs rounded flex items-center gap-1">
            <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
            Oppdateres
          </span>
        )}
      </div>

      {/* Desktop nav arrows */}
      <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] p-2 bg-black/40 backdrop-blur-sm rounded-full text-white/70 hover:text-white hover:bg-black/60 transition-colors hidden sm:flex" aria-label="Forrige">
        <ChevronLeft size={24} />
      </button>
      <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 z-[5] p-2 bg-black/40 backdrop-blur-sm rounded-full text-white/70 hover:text-white hover:bg-black/60 transition-colors hidden sm:flex" aria-label="Neste">
        <ChevronRight size={24} />
      </button>

      {/* Bottom controls */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-[5] flex flex-col items-center gap-3 p-4 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="flex items-center gap-1.5">
          {WEBCAMS.map((w, i) => (
            <button
              key={w.id}
              onClick={() => { setCurrentIndex(i); setShowSnapshot(false); }}
              className={cn(
                "rounded-full transition-all",
                i === currentIndex ? "w-2 h-2 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"
              )}
              aria-label={w.area}
            />
          ))}
        </div>
        {showingPreloadedVideo && (
          <button onClick={() => setShowSnapshot(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full hover:bg-white/30 transition-colors">
            <Image size={14} /> Stillbilde
          </button>
        )}
        <p className="text-[10px] text-white/30 sm:hidden">Sveip for å bytte kamera</p>
      </div>
    </div>
  );
};

export default WebcamModal;
