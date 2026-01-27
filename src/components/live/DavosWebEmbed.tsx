import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { ExternalLink } from "lucide-react";

export interface DavosWebEmbedProps {
  title: string;
  url: string;
  description?: string;
  height?: string;
  className?: string;
}

type LoadState = "loading" | "loaded" | "error";

export const DavosWebEmbed: React.FC<DavosWebEmbedProps> = ({
  title,
  url,
  description,
  height = "70vh",
  className,
}) => {
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const handleLoad = () => {
    setLoadState("loaded");
  };

  const handleError = () => {
    setLoadState("error");
  };

  const openInBrowser = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Reset state when URL changes
  React.useEffect(() => {
    setLoadState("loading");
  }, [url]);

  return (
    <div className={cn("flex flex-col", className)}>
      {description && (
        <p className="text-sm text-muted-foreground mb-2 px-1">{description}</p>
      )}
      
      <div 
        className="relative w-full rounded-lg overflow-hidden bg-muted"
        style={{ height }}
      >
        {/* Loading state */}
        {loadState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-full h-full p-4">
              <DavosSkeleton variant="rectangular" className="w-full h-full" />
            </div>
          </div>
        )}

        {/* Error state */}
        {loadState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
            <DavosErrorState
              title="Kunne ikke laste inn"
              description="Innholdet kunne ikke vises her."
              onRetry={openInBrowser}
              retryLabel="Åpne i nettleser"
            />
          </div>
        )}

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          src={url}
          title={title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "w-full h-full border-0",
            loadState !== "loaded" && "invisible"
          )}
        />
      </div>

      {/* Always show "Open in browser" link */}
      <button
        onClick={openInBrowser}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-end px-1"
      >
        <ExternalLink size={14} />
        <span>Åpne i nettleser</span>
      </button>
    </div>
  );
};
