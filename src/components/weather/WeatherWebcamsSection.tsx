import * as React from "react";
import { cn } from "@/lib/utils";
import { Camera, RefreshCw, ImageOff } from "lucide-react";
import { FEATURED_WEBCAMS, getWebcamProxyUrl, type Webcam } from "@/config/webcams";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Link } from "react-router-dom";

interface WebcamThumbnailProps {
  webcam: Webcam;
}

const WebcamThumbnail: React.FC<WebcamThumbnailProps> = ({ webcam }) => {
  const [imageState, setImageState] = React.useState<"loading" | "loaded" | "error">("loading");
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Auto-refresh every 60 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const imageUrl = `${getWebcamProxyUrl(webcam.imageUrl)}&t=${refreshKey}`;

  return (
    <div
      className={cn(
        "flex-shrink-0 w-36 overflow-hidden rounded-lg",
        "bg-muted"
      )}
    >
      {/* Image */}
      <div className="relative aspect-video bg-muted">
        {imageState === "loading" && (
          <DavosSkeleton variant="rectangular" className="absolute inset-0" />
        )}
        
        {imageState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageOff size={20} />
          </div>
        )}

        <img
          src={imageUrl}
          alt={webcam.area}
          loading="lazy"
          onLoad={() => setImageState("loaded")}
          onError={() => setImageState("error")}
          className={cn(
            "w-full h-full object-cover",
            imageState !== "loaded" && "invisible"
          )}
        />
        
        {/* Live badge */}
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-destructive text-destructive-foreground text-[10px] font-medium rounded">
          LIVE
        </div>
      </div>
      
      {/* Label */}
      <div className="px-2 py-1.5 text-left">
        <p className="font-heading text-xs font-semibold text-foreground truncate">
          {webcam.area}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {webcam.name}
          {webcam.elevation && ` • ${webcam.elevation}m`}
        </p>
      </div>
    </div>
  );
};

export const WeatherWebcamsSection: React.FC = () => {
  return (
    <div className="mt-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          Webcams
        </h2>
        <Link
          to="/webcams"
          className="text-xs text-primary flex items-center gap-1 tap-target hover:underline"
        >
          Alle webcams
        </Link>
      </div>

      {/* Horizontal scroll of webcam thumbnails */}
      <div 
        className="flex gap-3 px-4 overflow-x-auto overscroll-contain pb-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {FEATURED_WEBCAMS.map((webcam) => (
          <WebcamThumbnail key={webcam.id} webcam={webcam} />
        ))}
      </div>
    </div>
  );
};
