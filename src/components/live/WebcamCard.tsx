import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosCard } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { ExternalLink, ImageOff } from "lucide-react";
import type { FeaturedWebcam } from "@/config/liveInfo";

interface WebcamCardProps {
  webcam: FeaturedWebcam;
  className?: string;
}

type ImageState = "loading" | "loaded" | "error";

export const WebcamCard: React.FC<WebcamCardProps> = ({ webcam, className }) => {
  const [imageState, setImageState] = React.useState<ImageState>("loading");

  const openWebcam = () => {
    window.open(webcam.pageUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <DavosCard
      className={cn("overflow-hidden cursor-pointer group", className)}
      onClick={openWebcam}
    >
      {/* Image container */}
      <div className="relative aspect-video bg-muted">
        {imageState === "loading" && (
          <DavosSkeleton variant="rectangular" className="absolute inset-0" />
        )}
        
        {imageState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <ImageOff size={24} className="mb-1" />
            <span className="text-xs">Bilde ikke tilgjengelig</span>
          </div>
        )}

        <img
          src={webcam.imageUrl}
          alt={`Webcam ${webcam.name}`}
          onLoad={() => setImageState("loaded")}
          onError={() => setImageState("error")}
          className={cn(
            "w-full h-full object-cover transition-transform duration-300 group-hover:scale-105",
            imageState !== "loaded" && "invisible"
          )}
        />
      </div>

      {/* Info */}
      <div className="p-3 flex items-center justify-between">
        <div>
          <h3 className="font-heading font-semibold text-sm text-foreground">
            {webcam.name}
          </h3>
          <p className="text-xs text-muted-foreground">{webcam.area}</p>
        </div>
        <ExternalLink 
          size={16} 
          className="text-muted-foreground group-hover:text-foreground transition-colors" 
        />
      </div>
    </DavosCard>
  );
};
