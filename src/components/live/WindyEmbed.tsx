/**
 * Windy.com Embed Component
 * Shows animated wind/weather overlay for Davos region
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { Maximize2 } from "lucide-react";

interface WindyEmbedProps {
  className?: string;
  overlay?: "wind" | "rain" | "temp" | "clouds" | "snow" | "radar";
}

// Davos coordinates
const DAVOS_LAT = 46.8;
const DAVOS_LON = 9.83;
const ZOOM = 9;

export const WindyEmbed: React.FC<WindyEmbedProps> = ({ 
  className,
  overlay = "radar" // Default to radar mode per requirements
}) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Build Windy embed URL
  const embedUrl = React.useMemo(() => {
    const params = new URLSearchParams({
      type: "map",
      location: "coordinates",
      metricRain: "mm",
      metricTemp: "°C",
      metricWind: "m/s",
      zoom: ZOOM.toString(),
      overlay: overlay,
      product: "ecmwf",
      level: "surface",
      lat: DAVOS_LAT.toString(),
      lon: DAVOS_LON.toString(),
      autoplay: "true",
      animate: "true",
      message: "true",
    });
    return `https://embed.windy.com/embed.html?${params.toString()}`;
  }, [overlay]);

  // Fullscreen link
  const fullscreenUrl = `https://www.windy.com/?${DAVOS_LAT},${DAVOS_LON},${ZOOM}`;

  // Handle load timeout for iframe blocking detection
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        // If still loading after 5 seconds, assume blocked
        setIsLoading(false);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [isLoading]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleOpenFullscreen = () => {
    window.open(fullscreenUrl, "_blank");
  };

  if (hasError) {
    return (
      <div className={cn("rounded-[var(--radius-card)] overflow-hidden", className)}>
        <DavosErrorState
          title="Værkart kan ikke vises"
          description="Åpne Windy.com direkte for live vindkart"
          retryLabel="Åpne Windy"
          onRetry={handleOpenFullscreen}
        />
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-[var(--radius-card)] overflow-hidden bg-muted", className)}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 z-10">
          <DavosSkeleton className="w-full h-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Laster værkart...</span>
          </div>
        </div>
      )}

      {/* Windy iframe */}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Windy værkart – Davos"
        className="w-full h-full border-0"
        style={{ minHeight: "280px" }}
        allow="fullscreen"
        allowFullScreen
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Fullscreen button */}
      <button
        onClick={handleOpenFullscreen}
        className="absolute top-3 right-3 p-2 bg-background/90 backdrop-blur-sm rounded-lg hover:bg-background transition-colors z-20"
        aria-label="Åpne i fullskjerm"
      >
        <Maximize2 size={18} className="text-foreground" />
      </button>
    </div>
  );
};
