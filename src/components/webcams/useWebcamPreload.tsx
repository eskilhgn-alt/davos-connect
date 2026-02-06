/**
 * Webcam preload system
 * - Preloads snapshot images via <link rel="preload">
 * - Tracks which webcam video iframes have been preloaded
 * - Context-based so WebcamsScreen and WebcamModal share state
 */

import * as React from "react";
import { WEBCAMS, getWebcamProxyUrl } from "@/config/webcams";

interface PreloadContextValue {
  /** Mark a webcam video as preloaded */
  markPreloaded: (id: string) => void;
  /** Check if a webcam video is preloaded */
  isPreloaded: (id: string) => boolean;
}

const PreloadContext = React.createContext<PreloadContextValue>({
  markPreloaded: () => {},
  isPreloaded: () => false,
});

export const useWebcamPreload = () => React.useContext(PreloadContext);

export const WebcamPreloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const preloadedRef = React.useRef(new Set<string>());
  const [, forceUpdate] = React.useState(0);

  const markPreloaded = React.useCallback((id: string) => {
    if (!preloadedRef.current.has(id)) {
      preloadedRef.current.add(id);
      forceUpdate(n => n + 1);
    }
  }, []);

  const isPreloaded = React.useCallback((id: string) => {
    return preloadedRef.current.has(id);
  }, []);

  // Preload snapshot images on mount
  React.useEffect(() => {
    WEBCAMS.forEach((webcam) => {
      const url = getWebcamProxyUrl(webcam.snapshotUrl);
      const img = new window.Image();
      img.src = url;
    });
  }, []);

  const value = React.useMemo(() => ({ markPreloaded, isPreloaded }), [markPreloaded, isPreloaded]);

  return (
    <PreloadContext.Provider value={value}>
      {children}
    </PreloadContext.Provider>
  );
};
