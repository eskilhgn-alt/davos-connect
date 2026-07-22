import * as React from "react";
import { Camera, RefreshCw, WifiOff } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { MediaViewer } from "@/components/ui/MediaViewer";
import { ACTIVE_TRIP, type TripWebcamRef } from "@/config/trip";
import { cn } from "@/lib/utils";

function snapshotUrl(camera: TripWebcamRef, refreshKey: number) {
  if (!camera.snapshotUrl) return "";
  const separator = camera.snapshotUrl.includes("?") ? "&" : "?";
  return `${camera.snapshotUrl}${separator}guttahutte_refresh=${refreshKey}`;
}

export const WebcamsScreen: React.FC = () => {
  const [refreshKey, setRefreshKey] = React.useState(() => Math.floor(Date.now() / 60_000));
  const [failed, setFailed] = React.useState<Set<string>>(() => new Set());
  const [viewer, setViewer] = React.useState<{ src: string; name: string } | null>(null);
  const trip = ACTIVE_TRIP;

  const refresh = React.useCallback(() => {
    setFailed(new Set());
    setRefreshKey(Math.floor(Date.now() / 60_000));
  }, []);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Webkameraer"
        subtitle={`${trip.destination} · oppdateres hvert minutt`}
        leftAction={<BackButton fallbackPath="/live" />}
        rightAction={
          <button type="button" onClick={refresh} className="tap-target flex items-center justify-center text-muted-foreground" aria-label="Oppdater webkameraer">
            <RefreshCw size={18} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {trip.webcams.map((camera, index) => {
            const src = snapshotUrl(camera, refreshKey);
            const isFailed = failed.has(camera.id) || !src;
            return (
              <button
                key={camera.id}
                type="button"
                onClick={() => !isFailed && setViewer({ src, name: camera.name })}
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-border bg-muted text-left active:scale-[0.99] transition-transform",
                  index === 0 && "sm:col-span-2",
                )}
                aria-label={isFailed ? `${camera.name} er utilgjengelig` : `Åpne ${camera.name}`}
              >
                <div className={cn("relative w-full bg-muted", index === 0 ? "aspect-[16/9]" : "aspect-[16/10]")}>
                  {isFailed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <WifiOff size={23} />
                      <span className="text-xs">Kameraet er midlertidig offline</span>
                    </div>
                  ) : (
                    <img
                      src={src}
                      alt={`Livebilde fra ${camera.name}`}
                      className="h-full w-full object-cover"
                      loading={index < 2 ? "eager" : "lazy"}
                      decoding="async"
                      onError={() => setFailed((previous) => new Set(previous).add(camera.id))}
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 pt-10 text-white">
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-heading text-sm font-semibold truncate">{camera.name}</p>
                        {camera.area && <p className="text-[10px] text-white/75 truncate">{camera.area}</p>}
                      </div>
                      <Camera size={16} className="shrink-0" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="px-4 pb-4 text-center text-[10px] text-muted-foreground/70">Direktebilder fra Val Thorens sine offisielle kameraleverandører</p>
      </div>

      {viewer && <MediaViewer open src={viewer.src} type="image" onClose={() => setViewer(null)} />}
    </div>
  );
};

export default WebcamsScreen;
