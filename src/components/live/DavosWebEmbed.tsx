import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosCard } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { ExternalLink, Globe } from "lucide-react";

export interface DavosWebEmbedProps {
  title: string;
  url: string;
  description?: string;
  height?: string;
  className?: string;
  embeddable?: boolean;
}

type LoadState = "loading" | "loaded" | "error";

export const DavosWebEmbed: React.FC<DavosWebEmbedProps> = ({
  title,
  url,
  description,
  height = "100%",
  className,
  embeddable = true,
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
    if (embeddable) {
      setLoadState("loading");
    }
  }, [url, embeddable]);

  // Non-embeddable fallback card
  if (!embeddable) {
    return (
      <div className={cn("flex flex-col", className)}>
        <DavosCard className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Globe size={24} className="text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground mb-1">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mb-2">{description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Denne siden kan ikke vises inne i appen.
            </p>
          </div>
          <DavosButton onClick={openInBrowser} className="gap-2">
            <ExternalLink size={16} />
            Åpne hos Davos Klosters
          </DavosButton>
        </DavosCard>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {description && (
        <p className="text-sm text-muted-foreground mb-2 px-1">{description}</p>
      )}
      
      <div 
        className="relative flex-1 w-full rounded-lg overflow-hidden bg-muted"
        style={{ minHeight: height !== "100%" ? height : undefined }}
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
            <DavosCard className="p-6 flex flex-col items-center text-center gap-4 max-w-xs">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Globe size={24} className="text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-foreground mb-1">Kunne ikke laste inn</h3>
                <p className="text-sm text-muted-foreground">
                  Innholdet kunne ikke vises her.
                </p>
              </div>
              <DavosButton onClick={openInBrowser} className="gap-2">
                <ExternalLink size={16} />
                Åpne i nettleser
              </DavosButton>
            </DavosCard>
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
