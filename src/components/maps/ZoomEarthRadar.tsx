import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosButton } from "@/components/ui/davos-button";
import { Maximize2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ZOOM_EARTH_URL = "https://zoom.earth/places/switzerland/davos/#map=radar";

interface ZoomEarthRadarProps {
  className?: string;
}

export const ZoomEarthRadar: React.FC<ZoomEarthRadarProps> = ({ className }) => {
  const [state, setState] = React.useState<"loading" | "loaded" | "error">("loading");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Timeout-based fallback detection
  React.useEffect(() => {
    setState("loading");

    // Give iframe 4 seconds to show something
    const timeout = setTimeout(() => {
      // If still loading after timeout, assume it might be blocked
      // We optimistically show the iframe, but provide easy escape
      setState("loaded");
    }, 2000);

    return () => clearTimeout(timeout);
  }, []);

  const handleOpenExternal = () => {
    window.open(ZOOM_EARTH_URL, "_blank", "noopener,noreferrer");
  };

  // Try to detect iframe load errors (limited browser support)
  const handleIframeError = () => {
    setState("error");
  };

  if (state === "error") {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <DavosErrorState
          title="Radar kan ikke vises inne i appen"
          description="Nettstedet blokkerer innebygd visning. Åpne i fullskjerm."
          onRetry={handleOpenExternal}
          retryLabel="Åpne radar"
        />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* External link button */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Zoom Earth Radar
          </h2>
          <p className="text-sm text-muted-foreground">
            Sanntids radar og vind for Davos
          </p>
        </div>
        <DavosButton
          variant="ghost"
          size="icon"
          onClick={handleOpenExternal}
          aria-label="Åpne radar i fullskjerm"
        >
          <Maximize2 size={20} />
        </DavosButton>
      </div>

      {/* Iframe container */}
      <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden bg-muted">
        {state === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-muted">
            <Skeleton className="w-16 h-16 rounded-full" />
            <p className="text-sm text-muted-foreground">Laster radar...</p>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src={ZOOM_EARTH_URL}
          title="Zoom Earth Radar – Davos"
          className="w-full h-full border-0"
          allow="fullscreen"
          allowFullScreen
          loading="lazy"
          onError={handleIframeError}
          style={{ opacity: state === "loaded" ? 1 : 0 }}
        />
      </div>

      {/* Fallback link always visible */}
      <div className="mt-3 text-center shrink-0">
        <button
          type="button"
          onClick={handleOpenExternal}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Åpne radar i fullskjerm
        </button>
      </div>
    </div>
  );
};
