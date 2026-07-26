import * as React from "react";
import { Camera, Expand, ExternalLink, RefreshCw, WifiOff, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useTrip } from "@/contexts/TripContext";
import { resolveWebcams } from "@/features/webcams/resolveWebcams";
import type { TripWebcamRef } from "@/config/trip";
import { cn } from "@/lib/utils";

const IFRAME_ALLOW = "autoplay; fullscreen; picture-in-picture; accelerometer; gyroscope";

function snapshotSrc(camera: TripWebcamRef, refreshKey: number) {
  if (!camera.snapshotUrl) return "";
  const sep = camera.snapshotUrl.includes("?") ? "&" : "?";
  return `${camera.snapshotUrl}${sep}guttahutte_refresh=${refreshKey}`;
}

interface CardProps {
  camera: TripWebcamRef;
  featured?: boolean;
  refreshKey: number;
  onFail: (id: string) => void;
  isFailed: boolean;
  onExpand: (cam: TripWebcamRef) => void;
}

const WebcamCard: React.FC<CardProps> = ({ camera, featured, refreshKey, onFail, isFailed, onExpand }) => {
  const interactive = camera.mode === "interactive" && !!camera.playerUrl;
  const [iframeError, setIframeError] = React.useState(false);
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  const label = interactive && !iframeError ? "Interaktivt kamera" : camera.snapshotUrl ? "Snapshot" : "Utilgjengelig";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-muted",
        featured && "sm:col-span-2",
      )}
    >
      <div className={cn("relative w-full bg-muted", featured ? "aspect-[16/9]" : "aspect-[16/10]")}>
        {interactive && !iframeError ? (
          <>
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs animate-pulse">
                Laster {camera.provider ?? "kamera"}…
              </div>
            )}
            <iframe
              src={camera.playerUrl}
              title={`Live kamera fra ${camera.name}`}
              className="absolute inset-0 h-full w-full border-0"
              loading="eager"
              allow={IFRAME_ALLOW}
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setIframeLoaded(true)}
              onError={() => setIframeError(true)}
            />
          </>
        ) : camera.snapshotUrl && !isFailed ? (
          <img
            src={snapshotSrc(camera, refreshKey)}
            alt={`Bilde fra ${camera.name}`}
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
            onError={() => onFail(camera.id)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-4 text-center">
            <WifiOff size={22} />
            <span className="text-xs">Kameraet er midlertidig utilgjengelig</span>
            {camera.externalUrl && (
              <a
                href={camera.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] underline text-primary inline-flex items-center gap-1"
              >
                <ExternalLink size={12} /> Åpne hos {camera.provider ?? "leverandør"}
              </a>
            )}
          </div>
        )}
      </div>

      {/* App-chrome under player (does not overlay controls). */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-background">
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold truncate">{camera.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {camera.area ? `${camera.area} · ` : ""}
            {label}
            {camera.provider ? ` · ${camera.provider}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onExpand(camera)}
          className="tap-target flex items-center justify-center rounded-full bg-muted text-foreground/80"
          aria-label={`Utvid ${camera.name}`}
        >
          <Expand size={16} />
        </button>
      </div>
    </div>
  );
};

interface ExpandedProps {
  camera: TripWebcamRef;
  refreshKey: number;
  onClose: () => void;
}

const ExpandedCamera: React.FC<ExpandedProps> = ({ camera, refreshKey, onClose }) => {
  const interactive = camera.mode === "interactive" && !!camera.playerUrl;
  const [iframeError, setIframeError] = React.useState(false);
  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{ height: "var(--app-height)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Kamera ${camera.name}`}
    >
      <AppHeader
        title={camera.name}
        subtitle={camera.area ?? camera.provider}
        leftAction={
          <button type="button" onClick={onClose} className="tap-target flex items-center justify-center" aria-label="Lukk">
            <X size={20} />
          </button>
        }
        rightAction={
          camera.externalUrl ? (
            <a
              href={camera.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="tap-target flex items-center justify-center text-muted-foreground"
              aria-label="Åpne hos leverandør"
            >
              <ExternalLink size={18} />
            </a>
          ) : null
        }
      />
      <div className="flex-1 min-h-0 bg-black">
        {interactive && !iframeError ? (
          <iframe
            src={camera.playerUrl}
            title={`Live kamera fra ${camera.name}`}
            className="h-full w-full border-0"
            allow={IFRAME_ALLOW}
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            onError={() => setIframeError(true)}
          />
        ) : camera.snapshotUrl ? (
          <img
            src={snapshotSrc(camera, refreshKey)}
            alt={`Bilde fra ${camera.name}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-white/80 gap-2 p-6 text-center">
            <WifiOff size={28} />
            <p className="text-sm">Kameraet er ikke tilgjengelig akkurat nå.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const WebcamsScreen: React.FC = () => {
  const { selectedTrip } = useTrip();
  const cameras = React.useMemo(() => resolveWebcams(selectedTrip), [selectedTrip]);
  const hasSnapshotOnly = React.useMemo(
    () => cameras.some((c) => c.mode !== "interactive" && c.snapshotUrl),
    [cameras],
  );
  const [refreshKey, setRefreshKey] = React.useState(() => Math.floor(Date.now() / 60_000));
  const [failed, setFailed] = React.useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = React.useState<TripWebcamRef | null>(null);

  const refresh = React.useCallback(() => {
    setFailed(new Set());
    setRefreshKey(Math.floor(Date.now() / 60_000));
  }, []);

  // Kun snapshots trenger periodisk refresh. Ekte spillere oppdaterer seg selv.
  React.useEffect(() => {
    if (!hasSnapshotOnly) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [hasSnapshotOnly, refresh]);

  const onFail = React.useCallback((id: string) => {
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Webkameraer"
        subtitle={selectedTrip?.destination ?? "Ingen tur valgt"}
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          hasSnapshotOnly ? (
            <button
              type="button"
              onClick={refresh}
              className="tap-target flex items-center justify-center text-muted-foreground"
              aria-label="Oppdater snapshots"
            >
              <RefreshCw size={18} />
            </button>
          ) : null
        }
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        {cameras.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Camera size={22} />
            <p>Ingen webkameraer er konfigurert for denne turen.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {cameras.map((cam, idx) => (
              <WebcamCard
                key={cam.id}
                camera={cam}
                featured={idx === 0}
                refreshKey={refreshKey}
                onFail={onFail}
                isFailed={failed.has(cam.id)}
                onExpand={setExpanded}
              />
            ))}
          </div>
        )}
        <p className="px-4 pb-4 text-center text-[10px] text-muted-foreground/70">
          Direktebilder hentes fra leverandørens spiller. Snapshots merket «Snapshot» oppdateres periodisk.
        </p>
      </div>

      {expanded && (
        <ExpandedCamera camera={expanded} refreshKey={refreshKey} onClose={() => setExpanded(null)} />
      )}
    </div>
  );
};

export default WebcamsScreen;
