import * as React from "react";
import { Camera, Expand, ExternalLink, Play, RefreshCw, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useTrip } from "@/contexts/TripContext";
import { resolveWebcams } from "@/features/webcams/resolveWebcams";
import type { TripWebcamRef } from "@/config/trip";
import { cn } from "@/lib/utils";

const IFRAME_ALLOW = "autoplay; fullscreen; picture-in-picture; accelerometer; gyroscope";
const mediaLabel = (c: TripWebcamRef) => c.mode === "video" && c.streamUrl ? "Video" : c.mode === "interactive" && c.playerUrl ? "Panorama / periodiske bilder" : "Stillbilde";

/** One media node. Expansion changes CSS, never the source or player instance. */
const CameraPlayer: React.FC<{ camera: TripWebcamRef }> = ({ camera }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [snapshotVersion, setSnapshotVersion] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "ready" | "playing" | "blocked" | "error">("loading");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const expandRef = React.useRef<HTMLButtonElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  const isVideo = camera.mode === "video" && !!camera.streamUrl;
  const isPanorama = !isVideo && camera.mode === "interactive" && !!camera.playerUrl;
  const source = isVideo ? camera.streamUrl : isPanorama ? camera.playerUrl : camera.snapshotUrl;
  const snapshotSrc = React.useMemo(() => {
    if (!camera.snapshotUrl || !snapshotVersion) return camera.snapshotUrl;
    try {
      const url = new URL(camera.snapshotUrl);
      url.searchParams.set("guttahutte_refresh", String(snapshotVersion));
      return url.toString();
    } catch { return camera.snapshotUrl; }
  }, [camera.snapshotUrl, snapshotVersion]);
  React.useEffect(() => {
    if (isVideo || isPanorama || !camera.snapshotUrl) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setSnapshotVersion(Date.now());
    }, 60_000);
    return () => window.clearInterval(id);
  }, [isVideo, isPanorama, camera.snapshotUrl]);

  React.useEffect(() => {
    if (!source || status !== "loading") return;
    const id = window.setTimeout(() => setStatus("error"), 20_000);
    return () => window.clearTimeout(id);
  }, [source, status, attempt]);

  const play = React.useCallback(async () => {
    try { await videoRef.current?.play(); }
    catch (error) {
      const name = error && typeof error === "object" && "name" in error ? error.name : "";
      if (name === "NotAllowedError") setStatus("blocked");
      else if (name !== "AbortError") setStatus("error");
    }
  }, []);
  React.useEffect(() => { if (isVideo) void play(); }, [isVideo, play, attempt]);

  const close = React.useCallback(() => {
    setExpanded(false);
    requestAnimationFrame(() => expandRef.current?.focus());
  }, []);
  React.useEffect(() => {
    if (!expanded) return;
    sectionRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab") return;
      const nodes = sectionRef.current?.querySelectorAll<HTMLElement>('button, a[href], iframe, video[controls]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sectionRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, close]);

  return (
    <section ref={sectionRef} tabIndex={-1} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}
      aria-label={expanded ? `Kamera ${camera.name}` : undefined}
      className={cn("flex flex-col overflow-hidden bg-background", expanded ? "fixed inset-0 z-50" : "rounded-2xl border border-border")}
      style={expanded ? { height: "var(--app-height)" } : undefined}>
      {expanded && <AppHeader title={camera.name} subtitle={mediaLabel(camera)} rightAction={
        <button type="button" onClick={close} className="tap-target flex items-center justify-center" aria-label="Lukk"><X size={20} /></button>
      } />}
      <div className={cn("relative bg-muted overflow-hidden", expanded ? "flex-1 min-h-0" : "aspect-video")}>
        {source && isVideo ? (
          <video key={attempt} ref={videoRef} src={camera.streamUrl} poster={camera.snapshotUrl}
            aria-label={`Video fra ${camera.name}`} autoPlay muted playsInline controls preload="auto"
            className="absolute inset-0 h-full w-full object-contain"
            onPlaying={() => setStatus("playing")} onWaiting={() => setStatus("loading")}
            onStalled={() => setStatus("loading")} onError={() => setStatus("error")} />
        ) : source && isPanorama ? (
          <>
            {snapshotSrc && status !== "ready" && <img src={snapshotSrc} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" {...{ fetchpriority: "high" }} />}
            <iframe key={attempt} src={camera.playerUrl} title={`Panorama fra ${camera.name}`}
              className={cn("absolute inset-0 h-full w-full border-0", status === "loading" && camera.snapshotUrl && "opacity-0")} loading="eager" allow={IFRAME_ALLOW} allowFullScreen
              referrerPolicy="no-referrer-when-downgrade" onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
          </>
        ) : source ? (
          <img key={attempt} src={snapshotSrc} alt={`Bilde fra ${camera.name}`} className="absolute inset-0 h-full w-full object-contain" {...{ fetchpriority: "high" }}
            onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
        ) : null}
        {source && status === "loading" && <p role="status" className="absolute left-3 bottom-3 rounded-lg bg-background/90 px-3 py-2 text-xs">Åpner kamera…</p>}
        {status === "blocked" && <button type="button" onClick={() => void play()} className="absolute inset-x-8 top-1/2 -translate-y-1/2 min-h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2"><Play size={20} /> Start avspilling</button>}
        {(!source || status === "error") && <div role="status" className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center p-4 gap-3 text-center">
          <p className="text-sm">Kameraet er midlertidig utilgjengelig.</p>
          {source && <button type="button" onClick={() => { setStatus("loading"); setSnapshotVersion(Date.now()); setAttempt(n => n + 1); }} className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground flex items-center gap-2"><RefreshCw size={16} /> Prøv igjen</button>}
          <a href={camera.externalUrl} target="_blank" rel="noreferrer noopener" className="min-h-11 flex items-center text-sm underline">Åpne hos leverandør</a>
        </div>}
      </div>
      <div className="flex items-center justify-between gap-2 p-3 border-t border-border bg-background">
        <div className="min-w-0"><h2 className="font-heading text-sm font-semibold truncate">{camera.name}</h2><p className="text-xs text-muted-foreground">{mediaLabel(camera)}{camera.provider ? ` · ${camera.provider}` : ""}</p></div>
        <div className="flex shrink-0">
          <a href={camera.externalUrl} target="_blank" rel="noreferrer noopener" className="tap-target flex items-center justify-center" aria-label="Åpne hos leverandør"><ExternalLink size={18} /></a>
          {!expanded && <button ref={expandRef} type="button" onClick={() => setExpanded(true)} className="tap-target flex items-center justify-center" aria-label={`Utvid ${camera.name}`}><Expand size={18} /></button>}
        </div>
      </div>
    </section>
  );
};

const WebcamGallery: React.FC<{ cameras: TripWebcamRef[] }> = ({ cameras }) => {
  const [selectedId, setSelectedId] = React.useState(cameras[0]?.id);
  const selected = cameras.find(c => c.id === selectedId) ?? cameras[0];
  return <>
    {selected && <CameraPlayer key={`${selected.id}:${selected.playerUrl ?? selected.streamUrl ?? selected.snapshotUrl}`} camera={selected} />}
    <div className="grid grid-cols-2 gap-3" aria-label="Velg kamera">
      {cameras.map(camera => <button key={camera.id} type="button" aria-pressed={camera.id === selected?.id} onClick={() => setSelectedId(camera.id)}
        className={cn("text-left rounded-xl border overflow-hidden min-h-16", camera.id === selected?.id ? "border-primary ring-1 ring-primary" : "border-border")}>
        {camera.snapshotUrl && <img src={camera.snapshotUrl} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover bg-muted" />}
        <span className="block p-3 text-sm font-medium">{camera.name}</span>
      </button>)}
    </div>
  </>;
};

export const WebcamsScreen: React.FC = () => {
  const { selectedTrip } = useTrip();
  const cameras = React.useMemo(() => resolveWebcams(selectedTrip), [selectedTrip]);
  return <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
    <AppHeader title="Webkameraer" subtitle={selectedTrip?.destination ?? "Ingen tur valgt"} />
    <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 safe-area-bottom" style={{ WebkitOverflowScrolling: "touch" }}>
      {cameras.length ? <WebcamGallery key={selectedTrip?.id} cameras={cameras} /> : <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2"><Camera size={22} /><p>Ingen webkameraer er konfigurert for denne turen.</p></div>}
      <p className="text-xs text-muted-foreground">Panoramakameraene viser periodiske bilder, ikke sammenhengende video. Enkelte kameraer kan være sesongstengt.</p>
    </div>
  </div>;
};
export default WebcamsScreen;
