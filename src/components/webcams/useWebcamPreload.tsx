/**
 * WebcamPreloader - Pre-mounts hidden video iframes that get revealed
 * via CSS positioning when modal opens. NO DOM reparenting = no reload.
 */

import * as React from "react";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";

const MAX_PRELOAD = 6;

interface PreloadState {
  /** ID of webcam currently shown fullscreen (null = none) */
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  isPreloaded: (id: string) => boolean;
  loadedIds: Set<string>;
}

const PreloadContext = React.createContext<PreloadState>({
  activeId: null,
  setActiveId: () => {},
  isPreloaded: () => false,
  loadedIds: new Set(),
});

export const useWebcamPreload = () => React.useContext(PreloadContext);

export const WebcamPreloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [loadedIds, setLoadedIds] = React.useState<Set<string>>(new Set());

  const webcamsToPreload = React.useMemo(
    () => WEBCAMS.filter(w => w.videoUrl).slice(0, MAX_PRELOAD),
    []
  );

  const handleIframeLoad = React.useCallback((id: string) => {
    setLoadedIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const isPreloaded = React.useCallback((id: string) => loadedIds.has(id), [loadedIds]);

  // Preload snapshot images
  React.useEffect(() => {
    WEBCAMS.forEach((w) => {
      const img = new window.Image();
      img.src = getWebcamProxyUrl(w.snapshotUrl);
    });
  }, []);

  const value = React.useMemo(
    () => ({ activeId, setActiveId, isPreloaded, loadedIds }),
    [activeId, setActiveId, isPreloaded, loadedIds]
  );

  return (
    <PreloadContext.Provider value={value}>
      {children}
      {/* Preloaded iframes - positioned via CSS, never reparented */}
      {webcamsToPreload.map((webcam) => {
        const isActive = activeId === webcam.id;
        return (
          <div
            key={webcam.id}
            aria-hidden={!isActive}
            style={{
              position: 'fixed',
              inset: isActive ? 0 : undefined,
              top: isActive ? 0 : -9999,
              left: isActive ? 0 : -9999,
              width: isActive ? '100vw' : 1,
              height: isActive ? '100dvh' : 1,
              zIndex: isActive ? 50 : -1,
              overflow: 'hidden',
              pointerEvents: 'none',
              transition: 'none',
            }}
          >
            <iframe
              src={webcam.videoUrl!}
              style={{ width: '100%', height: '100%', border: 0 }}
              allow="autoplay; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => handleIframeLoad(webcam.id)}
              title={`${webcam.name} live`}
            />
          </div>
        );
      })}
    </PreloadContext.Provider>
  );
};
