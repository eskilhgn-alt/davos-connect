/**
 * YrWidgetPopup - Fullscreen modal with YR widgets for Davos
 * Fallback when API data is unavailable
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DavosButton } from "@/components/ui/davos-button";
import { X, ExternalLink, RefreshCw } from "lucide-react";

interface YrWidgetPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Davos coordinates for YR widgets
const DAVOS_LOCATION = "1-2760768"; // Davos location ID for YR

export const YrWidgetPopup: React.FC<YrWidgetPopupProps> = ({
  open,
  onOpenChange,
}) => {
  const [isLoading, setIsLoading] = React.useState(true);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // YR forecast widget URL
  const widgetUrl = `https://www.yr.no/nb/innhold/${DAVOS_LOCATION}/meteogram72.svg`;
  const externalUrl = `https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${DAVOS_LOCATION}/Davos`;

  React.useEffect(() => {
    if (open) {
      setIsLoading(true);
    }
  }, [open]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleOpenExternal = () => {
    window.open(externalUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="fixed inset-0 w-screen h-[100dvh] max-w-none max-h-none p-0 m-0 rounded-none border-none bg-background overflow-hidden"
        style={{ transform: 'none', left: 0, top: 0 }}
      >
        {/* Header */}
        <div 
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-primary"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
        >
          <div className="text-primary-foreground min-w-0 flex-1 pr-4">
            <h2 className="font-heading text-lg font-semibold">
              YR.no Varsel
            </h2>
            <p className="text-sm text-primary-foreground/70">
              Davos, Sveits
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <DavosButton
              variant="ghost"
              size="icon"
              onClick={handleOpenExternal}
              className="text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
              aria-label="Åpne YR.no"
            >
              <ExternalLink size={18} />
            </DavosButton>
            
            <DavosButton
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/10"
              aria-label="Lukk"
            >
              <X size={24} />
            </DavosButton>
          </div>
        </div>

        {/* Content */}
        <div 
          className="absolute inset-0 flex flex-col bg-background overflow-y-auto"
          style={{ 
            paddingTop: 'calc(max(env(safe-area-inset-top), 16px) + 72px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
          }}
        >
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Laster YR-varsel...</span>
            </div>
          )}

          {/* Meteogram widget */}
          <div className="p-4">
            <div className="bg-white rounded-lg overflow-hidden shadow-sm">
              <img
                src={widgetUrl}
                alt="YR.no værmeteogram for Davos"
                className="w-full h-auto"
                onLoad={handleLoad}
                onError={() => setIsLoading(false)}
              />
            </div>
          </div>

          {/* Full YR page in iframe */}
          <div className="flex-1 min-h-[500px] p-4 pt-0">
            <div className="h-full rounded-lg overflow-hidden border border-border">
              <iframe
                ref={iframeRef}
                src={externalUrl}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="YR.no full forecast"
                onLoad={handleLoad}
              />
            </div>
          </div>

          {/* Footer link */}
          <div className="p-4 pt-0 text-center">
            <button
              onClick={handleOpenExternal}
              className="text-sm text-primary hover:underline"
            >
              Åpne yr.no i nettleser →
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default YrWidgetPopup;
