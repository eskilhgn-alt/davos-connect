/**
 * WebcamPreloader - Pre-mounts hidden video iframes so they're already
 * buffering/playing when user opens a webcam modal.
 * 
 * Strategy: Mount real feratel iframes off-screen. When user opens modal,
 * the iframe is reparented into the modal via portal, avoiding reload.
 * 
 * To save resources, only preloads the first N webcams (configurable).
 */

import * as React from "react";
import { WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";

const MAX_PRELOAD = 6; // Preload first 6 webcams' video players

interface PreloadState {
  /** Get the container element for a preloaded webcam iframe */
  getIframeContainer: (webcamId: string) => HTMLDivElement | null;
  /** Check if a webcam has been preloaded */
  isPreloaded: (webcamId: string) => boolean;
  /** Set of loaded iframe IDs */
  loadedIds: Set<string>;
}

const PreloadContext = React.createContext<PreloadState>({
  getIframeContainer: () => null,
  isPreloaded: () => false,
  loadedIds: new Set(),
});

export const useWebcamPreload = () => React.useContext(PreloadContext);

export const WebcamPreloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const [loadedIds, setLoadedIds] = React.useState<Set<string>>(new Set());
  const hostRef = React.useRef<HTMLDivElement>(null);

  // Create hidden iframes on mount
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const webcamsToPreload = WEBCAMS.filter(w => w.videoUrl).slice(0, MAX_PRELOAD);

    webcamsToPreload.forEach((webcam) => {
      // Create container div
      const container = document.createElement("div");
      container.style.cssText = "width:1px;height:1px;overflow:hidden;position:absolute;left:-9999px;";
      container.dataset.webcamId = webcam.id;

      // Create iframe
      const iframe = document.createElement("iframe");
      iframe.src = webcam.videoUrl!;
      iframe.allow = "autoplay; fullscreen; picture-in-picture";
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.style.cssText = "width:100%;height:100%;border:0;";
      iframe.title = `${webcam.name} preload`;

      iframe.addEventListener("load", () => {
        setLoadedIds(prev => {
          const next = new Set(prev);
          next.add(webcam.id);
          return next;
        });
      });

      container.appendChild(iframe);
      host.appendChild(container);
      containerRefs.current.set(webcam.id, container);
    });

    // Also preload snapshot images
    WEBCAMS.forEach((webcam) => {
      const img = new window.Image();
      img.src = getWebcamProxyUrl(webcam.snapshotUrl);
    });

    return () => {
      // Cleanup
      containerRefs.current.forEach((container) => {
        container.remove();
      });
      containerRefs.current.clear();
    };
  }, []);

  const getIframeContainer = React.useCallback((webcamId: string) => {
    return containerRefs.current.get(webcamId) ?? null;
  }, []);

  const isPreloaded = React.useCallback((webcamId: string) => {
    return loadedIds.has(webcamId);
  }, [loadedIds]);

  const value = React.useMemo(() => ({ getIframeContainer, isPreloaded, loadedIds }), [getIframeContainer, isPreloaded, loadedIds]);

  return (
    <PreloadContext.Provider value={value}>
      {/* Hidden host for preloaded iframes */}
      <div ref={hostRef} aria-hidden="true" style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} />
      {children}
    </PreloadContext.Provider>
  );
};
