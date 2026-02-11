/**
 * Windy.com Embed Component
 * Shows animated wind/weather overlay with in-app fullscreen popup
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { Maximize2, X } from "lucide-react";

interface WindyEmbedProps {
  className?: string;
  overlay?: "wind" | "rain" | "temp" | "clouds" | "snow" | "radar";
  lat?: number;
  lon?: number;
}

const DEFAULT_LAT = 46.8;
const DEFAULT_LON = 9.83;
const ZOOM = 9;

export const WindyEmbed: React.FC<WindyEmbedProps> = ({
  className,
  overlay = "radar",
  lat,
  lon,
}) => {
  const activeLat = lat ?? DEFAULT_LAT;
  const activeLon = lon ?? DEFAULT_LON;
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const embedUrl = React.useMemo(() => {
    const params = new URLSearchParams({
      type: "map",
      location: "coordinates",
      metricRain: "mm",
      metricTemp: "°C",
      metricWind: "m/s",
      zoom: ZOOM.toString(),
      overlay,
      product: "ecmwf",
      level: "surface",
      lat: activeLat.toString(),
      lon: activeLon.toString(),
      autoplay: "true",
      animate: "true",
      message: "true",
    });
    return `https://embed.windy.com/embed.html?${params.toString()}`;
  }, [overlay, activeLat, activeLon]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) setIsLoading(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  const handleLoad = () => { setIsLoading(false); setHasError(false); };
  const handleError = () => { setIsLoading(false); setHasError(true); };

  const fullscreenUrl = `https://www.windy.com/?${activeLat},${activeLon},${ZOOM}`;
  const handleOpenExternal = () => window.open(fullscreenUrl, "_blank");

  if (hasError) {
    return (
      <div className={cn("rounded-[var(--radius-card)] overflow-hidden", className)}>
        <DavosErrorState
          title="Værkart kan ikke vises"
          description="Åpne Windy.com direkte for live vindkart"
          retryLabel="Åpne Windy"
          onRetry={handleOpenExternal}
        />
      </div>
    );
  }

  return (
    <>
      <div className={cn("relative rounded-[var(--radius-card)] overflow-hidden bg-muted", className)}>
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <DavosSkeleton className="w-full h-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Laster værkart...</span>
            </div>
          </div>
        )}

        <iframe
          src={embedUrl}
          title="Windy værkart"
          className="w-full h-full border-0"
          style={{ minHeight: "280px" }}
          allow="fullscreen"
          allowFullScreen
          onLoad={handleLoad}
          onError={handleError}
        />

        {/* Fullscreen button – bottom-left to avoid Windy's top-right controls */}
        <button
          onClick={() => setFullscreen(true)}
          className="absolute bottom-3 left-3 p-2 bg-background/90 backdrop-blur-sm rounded-lg hover:bg-background transition-colors z-20 active:scale-95"
          aria-label="Fullskjerm"
        >
          <Maximize2 size={16} className="text-foreground" />
        </button>
      </div>

      {/* In-app fullscreen popup */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-heading text-sm font-semibold">Værradar</h2>
            <button
              onClick={() => setFullscreen(false)}
              className="tap-target flex items-center justify-center"
              aria-label="Lukk"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1">
            <iframe
              src={embedUrl}
              title="Windy værkart fullskjerm"
              className="w-full h-full border-0"
              allow="fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </>
  );
};
