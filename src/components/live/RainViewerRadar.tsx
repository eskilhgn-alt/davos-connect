/**
 * RainViewer Radar Component
 * Uses RainViewer API for free animated radar tiles over OpenStreetMap
 * Auto-plays on mount with play/pause/speed controls
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosButton } from "@/components/ui/davos-button";
import { Play, Pause, SkipBack, SkipForward, Maximize2 } from "lucide-react";

interface RadarFrame {
  path: string;
  time: number;
}

interface RainViewerRadarProps {
  className?: string;
}

// Davos coordinates
const DAVOS_LAT = 46.8;
const DAVOS_LON = 9.83;
const ZOOM = 7;

export const RainViewerRadar: React.FC<RainViewerRadarProps> = ({ className }) => {
  const [frames, setFrames] = React.useState<RadarFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [playSpeed, setPlaySpeed] = React.useState(500); // ms between frames
  const intervalRef = React.useRef<number | null>(null);

  // Fetch available radar frames from RainViewer API
  const fetchRadarFrames = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!response.ok) throw new Error("Kunne ikke hente radardata");
      
      const data = await response.json();
      
      // Combine past and nowcast frames
      const past = data.radar?.past || [];
      const nowcast = data.radar?.nowcast || [];
      
      const allFrames: RadarFrame[] = [
        ...past.map((f: { path: string; time: number }) => ({ path: f.path, time: f.time })),
        ...nowcast.slice(0, 3).map((f: { path: string; time: number }) => ({ path: f.path, time: f.time })), // Only first 3 nowcast
      ];
      
      if (allFrames.length === 0) throw new Error("Ingen radarbilder tilgjengelig");
      
      setFrames(allFrames);
      setCurrentFrameIndex(past.length - 1); // Start at most recent past frame
      setIsLoading(false);
    } catch (err) {
      console.error("Radar fetch error:", err);
      setError(err instanceof Error ? err.message : "Ukjent feil");
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  React.useEffect(() => {
    fetchRadarFrames();
    
    // Refresh frame list every 10 minutes
    const refreshInterval = setInterval(fetchRadarFrames, 10 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [fetchRadarFrames]);

  // Animation loop
  React.useEffect(() => {
    if (isPlaying && frames.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setCurrentFrameIndex(prev => (prev + 1) % frames.length);
      }, playSpeed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, frames.length, playSpeed]);

  const currentFrame = frames[currentFrameIndex];
  const frameTime = currentFrame ? new Date(currentFrame.time * 1000) : null;

  // Generate tile URL for current frame
  const getTileUrl = (frame: RadarFrame) => {
    // RainViewer tile URL format
    const tileX = Math.floor((DAVOS_LON + 180) / 360 * Math.pow(2, ZOOM));
    const tileY = Math.floor((1 - Math.log(Math.tan(DAVOS_LAT * Math.PI / 180) + 1 / Math.cos(DAVOS_LAT * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, ZOOM));
    
    return `https://tilecache.rainviewer.com${frame.path}/256/${ZOOM}/${tileX}/${tileY}/2/1_1.png`;
  };

  const handleSpeedChange = () => {
    // Cycle through speeds: 500ms -> 300ms -> 200ms -> 500ms
    setPlaySpeed(prev => {
      if (prev === 500) return 300;
      if (prev === 300) return 200;
      return 500;
    });
  };

  const getSpeedLabel = () => {
    if (playSpeed === 500) return "1×";
    if (playSpeed === 300) return "1.5×";
    return "2×";
  };

  const handlePrevFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex(prev => (prev - 1 + frames.length) % frames.length);
  };

  const handleNextFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex(prev => (prev + 1) % frames.length);
  };

  const handleOpenFullscreen = () => {
    window.open(
      `https://www.rainviewer.com/map.html?loc=${DAVOS_LAT},${DAVOS_LON},${ZOOM}&oCS=1&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`,
      "_blank"
    );
  };

  if (isLoading) {
    return (
      <div className={cn("relative rounded-[var(--radius-card)] overflow-hidden", className)}>
        <DavosSkeleton className="w-full h-full min-h-[300px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Laster radar...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <DavosCard className={cn("", className)}>
        <DavosCardContent className="p-6 text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <DavosButton onClick={fetchRadarFrames} variant="outline">
            Prøv igjen
          </DavosButton>
        </DavosCardContent>
      </DavosCard>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Radar display */}
      <div className="relative flex-1 min-h-[300px] bg-muted rounded-[var(--radius-card)] overflow-hidden">
        {/* Base map (OpenStreetMap) */}
        <img
          src={`https://tile.openstreetmap.org/${ZOOM}/${Math.floor((DAVOS_LON + 180) / 360 * Math.pow(2, ZOOM))}/${Math.floor((1 - Math.log(Math.tan(DAVOS_LAT * Math.PI / 180) + 1 / Math.cos(DAVOS_LAT * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, ZOOM))}.png`}
          alt="Base map"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        
        {/* Radar overlay */}
        {currentFrame && (
          <img
            key={currentFrame.path}
            src={getTileUrl(currentFrame)}
            alt="Radar"
            className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-80"
            loading="eager"
          />
        )}
        
        {/* Time indicator */}
        {frameTime && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <p className="text-xs font-mono text-foreground">
              {frameTime.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}
        
        {/* Fullscreen button */}
        <button
          onClick={handleOpenFullscreen}
          className="absolute top-3 right-3 p-2 bg-background/90 backdrop-blur-sm rounded-lg hover:bg-background transition-colors"
          aria-label="Åpne i fullskjerm"
        >
          <Maximize2 size={18} className="text-foreground" />
        </button>
        
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-150"
            style={{ width: `${((currentFrameIndex + 1) / frames.length) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-1">
          <DavosButton
            variant="ghost"
            size="icon"
            onClick={handlePrevFrame}
            aria-label="Forrige"
            className="h-9 w-9"
          >
            <SkipBack size={18} />
          </DavosButton>
          
          <DavosButton
            variant="ghost"
            size="icon"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? "Pause" : "Spill"}
            className="h-9 w-9"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </DavosButton>
          
          <DavosButton
            variant="ghost"
            size="icon"
            onClick={handleNextFrame}
            aria-label="Neste"
            className="h-9 w-9"
          >
            <SkipForward size={18} />
          </DavosButton>
        </div>
        
        <button
          onClick={handleSpeedChange}
          className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Hastighet: {getSpeedLabel()}
        </button>
        
        <span className="text-xs text-muted-foreground">
          {currentFrameIndex + 1} / {frames.length}
        </span>
      </div>
    </div>
  );
};
