import * as React from "react";
import { cn } from "@/lib/utils";
import { MapPin, ExternalLink, AlertCircle } from "lucide-react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";

const ZOOM_EARTH_URL = "https://zoom.earth/#view=46.80,9.84,11z/map=live/overlays=radar:on,wind:on";

export const WeatherMapSection: React.FC = () => {
  const [embedError, setEmbedError] = React.useState(false);

  const openInBrowser = () => {
    window.open(ZOOM_EARTH_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mt-6">
      <h2 className="px-4 font-heading text-lg font-semibold text-foreground flex items-center gap-2 mb-3">
        <MapPin className="h-5 w-5 text-primary" />
        Værkart
      </h2>

      <div className="px-4">
        {embedError ? (
          <DavosCard>
            <DavosCardContent className="p-4 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Værkartet kan ikke vises i appen
              </p>
              <DavosButton
                variant="primary"
                onClick={openInBrowser}
                className="gap-2"
              >
                <ExternalLink size={16} />
                Åpne værkart
              </DavosButton>
            </DavosCardContent>
          </DavosCard>
        ) : (
          <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted">
            <iframe
              src={ZOOM_EARTH_URL}
              title="Værkart - Davos"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              onError={() => setEmbedError(true)}
              className="w-full h-full border-0"
            />
            
            {/* Fallback button overlay */}
            <button
              type="button"
              onClick={openInBrowser}
              className={cn(
                "absolute bottom-2 right-2 px-3 py-1.5 rounded-lg",
                "bg-background/90 backdrop-blur-sm",
                "text-xs font-medium text-foreground",
                "flex items-center gap-1.5",
                "hover:bg-background transition-colors"
              )}
            >
              <ExternalLink size={12} />
              Åpne fullskjerm
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
