/**
 * StoryCapture – Snapchat/Instagram-style story creation
 * Features:
 * - Tap for photo, hold for video (up to 60s)
 * - Pinch-to-zoom on camera
 * - Front/back camera toggle + flash
 * - Preview with editing tools:
 *   - Text overlay (draggable, multiple styles)
 *   - Freehand drawing
 *   - Undo support
 * - Final render: flattens edits onto image before publishing
 */

import * as React from "react";
import {
  X,
  RotateCcw,
  Send,
  Loader2,
  Type,
  Pencil,
  Undo2,
  Zap,
  ZapOff,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { validateStoryFile, MAX_STORY_VIDEO_SEC } from "@/features/stories/helpers";

interface StoryCaptureProps {
  onClose: () => void;
  onPublished: () => void;
}

interface TextOverlay {
  id: string;
  text: string;
  x: number; // percent
  y: number; // percent
  style: "bold" | "outline" | "bg";
  color: string;
}

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

const TEXT_COLORS = ["#ffffff", "#000000", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899"];
const DRAW_COLORS = ["#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#000000"];

export const StoryCapture: React.FC<StoryCaptureProps> = ({ onClose, onPublished }) => {
  const { user } = useAuth();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval>>();
  const hardStopTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const recordStartedAtRef = React.useRef<number>(0);
  const finalDurationRef = React.useRef<number>(0);
  const capturedUrlRef = React.useRef<string | null>(null);
  const pendingMetadataUrlRef = React.useRef<string | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawContainerRef = React.useRef<HTMLDivElement>(null);

  const [mode, setMode] = React.useState<"camera" | "preview">("camera");
  const [cameraError, setCameraError] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordTime, setRecordTime] = React.useState(0);
  const [capturedMedia, setCapturedMedia] = React.useState<{
    blob: Blob;
    type: "image" | "video";
    url: string;
    /** Bounded real duration in seconds for videos (1..60). */
    durationSec?: number;
  } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("environment");
  const [flashOn, setFlashOn] = React.useState(false);

  // Zoom state
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const pinchStartRef = React.useRef<number | null>(null);
  const zoomStartRef = React.useRef(1);

  // Editing state
  const [editMode, setEditMode] = React.useState<"none" | "text" | "draw">("none");
  const [textOverlays, setTextOverlays] = React.useState<TextOverlay[]>([]);
  const [drawPaths, setDrawPaths] = React.useState<DrawPath[]>([]);
  const [currentDrawPath, setCurrentDrawPath] = React.useState<DrawPath | null>(null);
  const [textInput, setTextInput] = React.useState("");
  const [textColor, setTextColor] = React.useState("#ffffff");
  const [textStyle, setTextStyle] = React.useState<"bold" | "outline" | "bg">("bold");
  const [drawColor, setDrawColor] = React.useState("#ffffff");
  const [showTextEditor, setShowTextEditor] = React.useState(false);
  const textInputRef = React.useRef<HTMLInputElement>(null);

  // Drag state for text overlays
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const dragStartRef = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const MAX_RECORD_SECS = MAX_STORY_VIDEO_SEC;

  /** Clamp to [1, MAX_RECORD_SECS] and reject non-finite values. */
  const boundDurationSec = React.useCallback((raw: number): number | null => {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.min(MAX_RECORD_SECS, Math.max(1, Math.ceil(raw)));
  }, [MAX_RECORD_SECS]);

  /** Revoke the latest captured object URL exactly once. */
  const revokeCapturedUrl = React.useCallback(() => {
    const u = capturedUrlRef.current;
    if (!u) return;
    capturedUrlRef.current = null;
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
  }, []);


  // ─── Capture mode: photo vs video (declared before camera effect so it
  // can drive whether we request mic permission). ───
  const [captureMode, setCaptureMode] = React.useState<"photo" | "video">("photo");

  // ─── Camera ───
  const unmountedRef = React.useRef(false);

  const startCamera = React.useCallback(async () => {
    try {
      setCameraError(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Only request microphone in video mode — photo mode must never surprise-prompt.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          ...(typeof MediaStreamTrack !== 'undefined' && { resizeMode: 'none' }),
        },
        audio: captureMode === "video",
      });
      // If the component unmounted between the await and here, drop the stream.
      if (unmountedRef.current) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as any;
      if (caps?.zoom) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] });
        } catch {}
      }
      if (!unmountedRef.current) setZoomLevel(1);
    } catch (err) {
      if (unmountedRef.current) return;
      console.error("[StoryCapture] Camera error:", err);
      setCameraError(true);
    }
  }, [facingMode, captureMode]);

  React.useEffect(() => {
    if (mode === "camera") startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, startCamera]);

  // Full component cleanup: stop recorder, tracks, timers; revoke object URLs
  // (both captured and pending metadata) exactly once via refs so the effect
  // always sees the latest value.
  React.useEffect(() => {
    return () => {
      unmountedRef.current = true;
      try {
        const r = recorderRef.current;
        if (r) {
          r.ondataavailable = null;
          r.onstop = null;
          r.onerror = null;
          if (r.state === "recording") r.stop();
        }
      } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
      revokeCapturedUrl();
      const pm = pendingMetadataUrlRef.current;
      if (pm) {
        pendingMetadataUrlRef.current = null;
        try { URL.revokeObjectURL(pm); } catch { /* ignore */ }
      }
    };
    // Intentionally run only on unmount; refs guarantee latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Apply zoom via video track constraints
  React.useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.() as any;
    if (caps?.zoom) {
      const maxZoom = Math.min(caps.zoom.max, 5);
      const clampedZoom = Math.min(Math.max(zoomLevel, caps.zoom.min), maxZoom);
      track.applyConstraints({ advanced: [{ zoom: clampedZoom } as any] }).catch(() => {});
    }
  }, [zoomLevel]);

  // ─── Pinch-to-zoom ───
  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (pinchStartRef.current === null) {
        pinchStartRef.current = dist;
        zoomStartRef.current = zoomLevel;
      } else {
        const scale = dist / pinchStartRef.current;
        setZoomLevel(Math.max(1, Math.min(5, zoomStartRef.current * scale)));
      }
    }
  }, [zoomLevel]);

  const handleTouchEnd = React.useCallback(() => {
    pinchStartRef.current = null;
  }, []);

  // ─── Flash ───
  React.useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.() as any;
    if (caps?.torch) {
      track.applyConstraints({ advanced: [{ torch: flashOn } as any] }).catch(() => {});
    }
  }, [flashOn]);

  // ─── Photo / Video capture ───
  const takePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob || unmountedRef.current) return;
        revokeCapturedUrl();
        const url = URL.createObjectURL(blob);
        capturedUrlRef.current = url;
        setCapturedMedia({ blob, type: "image", url });
        setMode("preview");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      },
      "image/jpeg",
      0.9
    );
  };

  // Detect best supported MIME type for recording
  const getRecordingMimeType = (): string => {
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const mime of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return ""; // Let browser pick default
  };

  const stopRecording = React.useCallback(() => {
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch { /* ignore */ }
    setIsRecording(false);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = undefined; }
    if (hardStopTimerRef.current) { clearTimeout(hardStopTimerRef.current); hardStopTimerRef.current = undefined; }
  }, []);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    finalDurationRef.current = 0;
    const mimeType = getRecordingMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, options);
    } catch (err) {
      console.warn("[StoryCapture] MediaRecorder failed with options, trying default:", err);
      try {
        recorder = new MediaRecorder(streamRef.current);
      } catch (err2) {
        console.error("[StoryCapture] MediaRecorder not supported:", err2);
        errorToast("Video-opptak støttes ikke på denne enheten");
        return;
      }
    }
    const actualMime = recorder.mimeType || mimeType || "video/mp4";
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (unmountedRef.current) return;
      const blob = new Blob(chunksRef.current, { type: actualMime });
      if (blob.size > 100 * 1024 * 1024) {
        errorToast("Videoen er for stor (maks 100 MB)");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        return;
      }
      // Use the monotonic startedAt to compute a bounded duration (1..60).
      const elapsed = recordStartedAtRef.current
        ? (performance.now() - recordStartedAtRef.current) / 1000
        : 0;
      const bounded = boundDurationSec(elapsed) ?? 1;
      finalDurationRef.current = bounded;
      revokeCapturedUrl();
      const url = URL.createObjectURL(blob);
      capturedUrlRef.current = url;
      setCapturedMedia({ blob, type: "video", url, durationSec: bounded });
      setRecordTime(bounded);
      setMode("preview");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    recorder.onerror = (ev) => {
      console.warn("[StoryCapture] recorder error:", ev);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordTime(0);
    recordStartedAtRef.current = performance.now();

    // Display counter (visual only). Uses the monotonic start so drift never
    // exceeds the hard stop, and never advances past MAX_RECORD_SECS.
    recordTimerRef.current = setInterval(() => {
      if (unmountedRef.current) return;
      const elapsed = (performance.now() - recordStartedAtRef.current) / 1000;
      const shown = Math.min(MAX_RECORD_SECS, Math.max(0, Math.floor(elapsed)));
      setRecordTime(shown);
    }, 250);

    // Hard timeout guarantees we stop AT or BEFORE MAX_RECORD_SECS regardless
    // of visual counter jitter or a stuck interval.
    hardStopTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORD_SECS * 1000);
  };

  const handleCaptureButtonTap = () => {
    if (mode !== "camera") return;
    if (captureMode === "photo") {
      takePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  const retake = () => {
    revokeCapturedUrl();
    setCapturedMedia(null);
    setRecordTime(0);
    finalDurationRef.current = 0;
    setTextOverlays([]);
    setDrawPaths([]);
    setEditMode("none");
    setCameraError(false);
    setMode("camera");
  };

  // ─── File input fallback ───
  /**
   * Read a video's real duration. Rejects on error / NaN / Infinity / 0
   * so callers can fail visibly instead of accepting garbage.
   * The pending object URL is tracked in a ref so unmount can revoke it.
   */
  const readVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      pendingMetadataUrlRef.current = url;
      const v = document.createElement("video");
      v.preload = "metadata";
      const cleanup = () => {
        if (pendingMetadataUrlRef.current === url) {
          pendingMetadataUrlRef.current = null;
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        }
      };
      v.onloadedmetadata = () => {
        const d = v.duration;
        cleanup();
        if (unmountedRef.current) { reject(new Error("unmounted")); return; }
        if (!Number.isFinite(d) || d <= 0) {
          reject(new Error("invalid_duration"));
          return;
        }
        resolve(d);
      };
      v.onerror = () => {
        cleanup();
        reject(new Error("metadata_load_failed"));
      };
      v.src = url;
    });
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateStoryFile({ size: file.size, type: file.type });
    if (!check.ok) {
      if (check.reason === "unsupported_type") errorToast("Ikke støttet filtype");
      else if (check.reason === "too_large") errorToast("Filen er for stor (maks 100 MB)");
      else errorToast("Kan ikke bruke denne filen");
      e.target.value = "";
      return;
    }
    const type = file.type.startsWith("video") ? "video" as const : "image" as const;
    let bounded: number | undefined;
    if (type === "video") {
      let raw: number;
      try {
        raw = await readVideoDuration(file);
      } catch (err) {
        if (unmountedRef.current) { e.target.value = ""; return; }
        console.warn("[StoryCapture] video metadata error:", err);
        errorToast("Kunne ikke lese video-lengden");
        e.target.value = "";
        return;
      }
      if (unmountedRef.current) { e.target.value = ""; return; }
      if (raw > MAX_RECORD_SECS + 0.5) {
        errorToast(`Video er lengre enn ${MAX_RECORD_SECS}s`);
        e.target.value = "";
        return;
      }
      const b = boundDurationSec(raw);
      if (b === null) {
        errorToast("Ugyldig videolengde");
        e.target.value = "";
        return;
      }
      bounded = b;
    }
    revokeCapturedUrl();
    const url = URL.createObjectURL(file);
    capturedUrlRef.current = url;
    setCapturedMedia({ blob: file, type, url, durationSec: bounded });
    if (type === "video" && bounded) {
      finalDurationRef.current = bounded;
      setRecordTime(bounded);
    }
    setMode("preview");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    e.target.value = "";
  };




  // ─── Drawing ───
  const getRelativePos = (e: React.TouchEvent | React.PointerEvent) => {
    const rect = drawContainerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const onDrawStart = (e: React.PointerEvent) => {
    if (editMode !== "draw") return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setCurrentDrawPath({ points: [pos], color: drawColor, width: 3 });
  };

  const onDrawMove = (e: React.PointerEvent) => {
    if (!currentDrawPath || editMode !== "draw") return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setCurrentDrawPath((prev) =>
      prev ? { ...prev, points: [...prev.points, pos] } : null
    );
  };

  const onDrawEnd = () => {
    if (currentDrawPath && currentDrawPath.points.length > 1) {
      setDrawPaths((prev) => [...prev, currentDrawPath]);
    }
    setCurrentDrawPath(null);
  };

  // ─── Text overlay ───
  const addTextOverlay = () => {
    if (!textInput.trim()) return;
    setTextOverlays((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: textInput.trim(),
        x: 50,
        y: 50,
        style: textStyle,
        color: textColor,
      },
    ]);
    setTextInput("");
    setShowTextEditor(false);
    setEditMode("none");
  };

  // ─── Drag text ───
  const onTextPointerDown = (e: React.PointerEvent, overlay: TextOverlay) => {
    if (editMode === "draw") return;
    e.stopPropagation();
    setDraggingId(overlay.id);
    const rect = drawContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: overlay.x,
      oy: overlay.y,
    };
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!draggingId || !dragStartRef.current) return;
    const rect = drawContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
    setTextOverlays((prev) =>
      prev.map((t) =>
        t.id === draggingId
          ? { ...t, x: dragStartRef.current!.ox + dx, y: dragStartRef.current!.oy + dy }
          : t
      )
    );
  };

  const onDragEnd = () => {
    setDraggingId(null);
    dragStartRef.current = null;
  };

  // ─── Undo ───
  const handleUndo = () => {
    if (drawPaths.length > 0) {
      setDrawPaths((prev) => prev.slice(0, -1));
    } else if (textOverlays.length > 0) {
      setTextOverlays((prev) => prev.slice(0, -1));
    }
  };

  // ─── Render edits onto final image ───
  const renderFinalImage = async (): Promise<Blob> => {
    if (capturedMedia?.type === "video" || !capturedMedia) return capturedMedia!.blob;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas ctx unavailable")); return; }
        ctx.drawImage(img, 0, 0);

        const scaleX = img.width / 100;
        const scaleY = img.height / 100;

        // Draw paths
        for (const path of drawPaths) {
          if (path.points.length < 2) continue;
          ctx.beginPath();
          ctx.strokeStyle = path.color;
          ctx.lineWidth = path.width * (img.width / 400);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.moveTo(path.points[0].x * scaleX, path.points[0].y * scaleY);
          for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x * scaleX, path.points[i].y * scaleY);
          }
          ctx.stroke();
        }

        // Draw text overlays
        for (const t of textOverlays) {
          const fontSize = Math.round(img.width / 16);
          ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tx = (t.x / 100) * img.width;
          const ty = (t.y / 100) * img.height;

          if (t.style === "bg") {
            const metrics = ctx.measureText(t.text);
            const pad = fontSize * 0.4;
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.roundRect(
              tx - metrics.width / 2 - pad,
              ty - fontSize / 2 - pad / 2,
              metrics.width + pad * 2,
              fontSize + pad,
              fontSize * 0.2
            );
            ctx.fill();
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, tx, ty);
          } else if (t.style === "outline") {
            ctx.strokeStyle = "#000";
            ctx.lineWidth = fontSize * 0.12;
            ctx.strokeText(t.text, tx, ty);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, tx, ty);
          } else {
            ctx.fillStyle = t.color;
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur = fontSize * 0.15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = fontSize * 0.05;
            ctx.fillText(t.text, tx, ty);
            ctx.shadowBlur = 0;
          }
        }

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob returned null"));
        }, "image/jpeg", 0.9);
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = capturedMedia.url;
    });
  };

  // ─── Publish ───
  const publish = async () => {
    if (!capturedMedia || !user) return;
    setUploading(true);

    let uploadedPath: string | null = null;
    try {
      // Render edits onto final image (photos) — this canvas pass also strips EXIF.
      let finalBlob: Blob;
      if (capturedMedia.type === "image") {
        if (textOverlays.length > 0 || drawPaths.length > 0) {
          finalBlob = await renderFinalImage();
        } else {
          // No edits but still re-encode via canvas to strip EXIF and cap size.
          const { reencodeImage } = await import("@/lib/imageOptimize");
          finalBlob = await reencodeImage(capturedMedia.blob, { maxDim: 2000, quality: 0.9 });
        }
      } else {
        finalBlob = capturedMedia.blob;
      }

      // Validate final blob size/MIME before upload.
      const check = validateStoryFile({ size: finalBlob.size, type: finalBlob.type });
      if (!check.ok) {
        if (check.reason === "too_large") throw new Error("Filen er for stor (maks 100 MB)");
        if (check.reason === "unsupported_type") throw new Error("Ikke støttet filtype");
        throw new Error("Kan ikke publisere denne filen");
      }

      const isVideo = capturedMedia.type === "video";
      const blobMime = finalBlob.type || (isVideo ? "video/mp4" : "image/jpeg");
      const ext = isVideo
        ? (blobMime.includes("mp4") ? "mp4" : blobMime.includes("webm") ? "webm" : "mp4")
        : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("stories")
        .upload(path, finalBlob, {
          contentType: blobMime,
          cacheControl: "3600",
        });
      if (uploadErr) throw uploadErr;
      uploadedPath = path;

      // Persist the bounded real duration (never the counter).
      const persistDuration = capturedMedia.type === "video"
        ? (capturedMedia.durationSec ?? boundDurationSec(finalDurationRef.current) ?? 1)
        : 0;

      const { data: inserted, error: insertErr } = await supabase.from("stories").insert({
        user_id: user.id,
        storage_path: path,
        type: capturedMedia.type,
        duration_sec: persistDuration,
      }).select("id").maybeSingle();
      if (insertErr) throw insertErr;

      // DB insert succeeded — object is now "owned" and must not be cleaned up.
      uploadedPath = null;

      // Gallery sync handled by database trigger (sync_story_to_gallery)

      // Send story push (best effort — inspect resolved error).
      if (inserted?.id) {
        try {
          const { error: pushErr } = await supabase.functions.invoke("story-push", {
            body: { story_id: inserted.id },
          });
          if (pushErr) {
            console.warn("[story-push] failed:", pushErr);
            toast.warning("Story publisert, men varsel ble ikke sendt");
          }
        } catch (e) {
          console.warn("[story-push] failed:", e);
          toast.warning("Story publisert, men varsel ble ikke sendt");
        }
      }

      toast.success("Story publisert! 🎉");
      revokeCapturedUrl();
      onPublished();
    } catch (err: any) {
      console.error("Publish error:", err);
      // Cleanup orphan storage object if insert failed after upload.
      if (uploadedPath) {
        const { error: cleanupErr } = await supabase.storage.from("stories").remove([uploadedPath]);
        if (cleanupErr) {
          console.warn("[StoryCapture] Orphan cleanup failed:", cleanupErr);
          toast.warning("Publisering feilet – midlertidig fil kunne ikke fjernes");
        }
      }
      errorToast(err?.message || "Kunne ikke publisere story");
    } finally {
      setUploading(false);
    }
  };


  // ─── Progress ring ───
  const ringProgress = recordTime / MAX_RECORD_SECS;
  const ringSize = 88;
  const ringStroke = 4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  // SVG for drawing paths
  const renderDrawPaths = (paths: DrawPath[], current: DrawPath | null) => (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      {[...paths, ...(current ? [current] : [])].map((path, i) => {
        if (path.points.length < 2) return null;
        const d = path.points.map((p, j) => `${j === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={path.color}
            strokeWidth={path.width * 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Hidden file input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk"
          className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          <X size={22} aria-hidden />
        </button>

        <div className="flex items-center gap-2">
          {mode === "camera" && (
            <>
              <button
                type="button"
                onClick={() => setFlashOn((f) => !f)}
                aria-label={flashOn ? "Slå av blits" : "Slå på blits"}
                aria-pressed={flashOn}
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                {flashOn ? <Zap size={20} aria-hidden /> : <ZapOff size={20} aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))}
                aria-label="Bytt kamera"
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                <RotateCcw size={20} aria-hidden />
              </button>
            </>
          )}
          {mode === "preview" && (
            <>
              {(textOverlays.length > 0 || drawPaths.length > 0) && (
                <button
                  type="button"
                  onClick={handleUndo}
                  aria-label="Angre siste"
                  className="p-2.5 min-w-[44px] min-h-[44px] rounded-full bg-black/50 text-white backdrop-blur-sm"
                >
                  <Undo2 size={20} aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (editMode === "draw") {
                    setEditMode("none");
                  } else {
                    setEditMode("draw");
                  }
                }}
                aria-label="Tegn"
                aria-pressed={editMode === "draw"}
                className={cn(
                  "p-2.5 min-w-[44px] min-h-[44px] rounded-full backdrop-blur-sm",
                  editMode === "draw" ? "bg-white text-black" : "bg-black/50 text-white"
                )}
              >
                <Pencil size={20} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editMode === "text" || showTextEditor) {
                    setEditMode("none");
                    setShowTextEditor(false);
                  } else {
                    setEditMode("text");
                    setShowTextEditor(true);
                    setTimeout(() => textInputRef.current?.focus(), 100);
                  }
                }}
                aria-label="Legg til tekst"
                aria-pressed={editMode === "text"}
                className={cn(
                  "p-2.5 min-w-[44px] min-h-[44px] rounded-full backdrop-blur-sm",
                  editMode === "text" ? "bg-white text-black" : "bg-black/50 text-white"
                )}
              >
                <Type size={20} aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>


      {/* Zoom indicator */}
      {mode === "camera" && zoomLevel > 1 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-mono backdrop-blur-sm">
          {zoomLevel.toFixed(1)}×
        </div>
      )}

      {/* Main content area */}
      <div
        ref={drawContainerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onTouchMove={mode === "camera" ? handleTouchMove as any : undefined}
        onTouchEnd={mode === "camera" ? handleTouchEnd : undefined}
        onPointerDown={editMode === "draw" ? onDrawStart : undefined}
        onPointerMove={editMode === "draw" ? onDrawMove : draggingId ? onDragMove : undefined}
        onPointerUp={editMode === "draw" ? onDrawEnd : draggingId ? onDragEnd : undefined}
      >
        {mode === "camera" && !cameraError ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : mode === "camera" && cameraError ? (
          <div className="flex flex-col items-center justify-center gap-4 text-white text-center px-8">
            <p className="text-lg font-semibold">Kunne ikke åpne kamera</p>
            <p className="text-sm text-white/60">Sjekk at appen har tilgang til kamera i telefonens innstillinger, eller bruk knappen under for å ta bilde/video direkte.</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full bg-white text-black font-semibold active:scale-95 transition-transform"
            >
              Velg bilde/video
            </button>
          </div>
        ) : capturedMedia?.type === "video" ? (
          <video
            src={capturedMedia.url}
            autoPlay
            playsInline
            loop
            muted
            className="w-full h-full object-cover"
            onLoadedData={(e) => {
              const v = e.currentTarget;
              // iOS requires play() call + unmute after confirmed playing
              v.play().then(() => { v.muted = false; }).catch(() => {});
            }}
          />
        ) : (
          <img
            src={capturedMedia?.url}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        )}

        {/* Drawing overlay */}
        {mode === "preview" && renderDrawPaths(drawPaths, currentDrawPath)}

        {/* Text overlays */}
        {mode === "preview" &&
          textOverlays.map((t) => (
            <div
              key={t.id}
              onPointerDown={(e) => onTextPointerDown(e, t)}
              className="absolute select-none cursor-move"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                transform: "translate(-50%, -50%)",
                touchAction: "none",
              }}
            >
              <span
                className={cn(
                  "text-xl font-bold whitespace-nowrap",
                  t.style === "bg" && "px-3 py-1.5 rounded-lg bg-black/60",
                  t.style === "outline" && "drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                )}
                style={{
                  color: t.color,
                  textShadow:
                    t.style === "bold"
                      ? "0 2px 8px rgba(0,0,0,0.7)"
                      : t.style === "outline"
                      ? "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
                      : undefined,
                }}
              >
                {t.text}
              </span>
            </div>
          ))}

        {/* Recording time badge */}
        {isRecording && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 bg-red-600/90 rounded-full backdrop-blur-sm">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white text-sm font-mono tabular-nums">
              {Math.floor(recordTime / 60).toString().padStart(2, "0")}:
              {(recordTime % 60).toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Text editor panel */}
      {showTextEditor && (
        <div className="absolute bottom-28 left-0 right-0 z-30 px-4 space-y-3">
          {/* Color picker */}
          <div className="flex items-center justify-center gap-2">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTextColor(c)}
                aria-label={`Tekstfarge ${c}`}
                aria-pressed={textColor === c}
                className={cn(
                  "w-11 h-11 rounded-full border-2 transition-transform flex items-center justify-center",
                  textColor === c ? "border-white scale-110" : "border-white/30"
                )}
              >
                <span aria-hidden className="w-7 h-7 rounded-full" style={{ backgroundColor: c }} />
              </button>
            ))}
          </div>

          {/* Style toggle */}
          <div className="flex items-center justify-center gap-2">
            {(["bold", "outline", "bg"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTextStyle(s)}
                aria-label={s === "bold" ? "Fet tekst" : s === "outline" ? "Tekst med omriss" : "Tekst med bakgrunn"}
                aria-pressed={textStyle === s}
                className={cn(
                  "px-3 py-1 min-h-[36px] rounded-full text-xs font-medium transition-colors",
                  textStyle === s ? "bg-white text-black" : "bg-white/20 text-white"
                )}
              >
                {s === "bold" ? "Fet" : s === "outline" ? "Omriss" : "Bakgrunn"}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2">
            <input
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTextOverlay()}
              placeholder="Skriv tekst..."
              aria-label="Tekst til story"
              className="flex-1 px-4 py-3 rounded-full bg-white/15 text-white placeholder:text-white/40 backdrop-blur-sm border border-white/20 text-sm focus:outline-none focus:border-white/50"
            />
            <button
              type="button"
              onClick={addTextOverlay}
              disabled={!textInput.trim()}
              aria-label="Legg til tekst"
              className="p-3 min-w-[44px] min-h-[44px] rounded-full bg-white text-black disabled:opacity-40"
            >
              <Check size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* Draw color picker */}
      {editMode === "draw" && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-black/60 backdrop-blur-sm">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setDrawColor(c)}
              aria-label={`Tegnefarge ${c}`}
              aria-pressed={drawColor === c}
              className={cn(
                "w-11 h-11 rounded-full border-2 transition-transform flex items-center justify-center",
                drawColor === c ? "border-white scale-110" : "border-white/30"
              )}
            >
              <span aria-hidden className="w-7 h-7 rounded-full" style={{ backgroundColor: c }} />
            </button>
          ))}
        </div>
      )}


      {/* Bottom controls */}
      <div
        className="flex items-center justify-center gap-6 py-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}
      >
        {mode === "camera" ? (
          <>
            {/* Mode toggle: Photo / Video */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full p-1">
              <button
                type="button"
                onClick={() => { if (!isRecording) setCaptureMode("photo"); }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  captureMode === "photo" ? "bg-white text-black" : "text-white/70"
                )}
              >
                Foto
              </button>
              <button
                type="button"
                onClick={() => { if (!isRecording) setCaptureMode("video"); }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  captureMode === "video" ? "bg-white text-black" : "text-white/70"
                )}
              >
                Video
              </button>
            </div>

            <div className="relative flex items-center justify-center">
              {isRecording && (
                <svg width={ringSize} height={ringSize} className="absolute -rotate-90">
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={ringStroke} />
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="#ef4444" strokeWidth={ringStroke} strokeDasharray={ringCircumference} strokeDashoffset={ringCircumference * (1 - ringProgress)} strokeLinecap="round" />
                </svg>
              )}
              <button
                type="button"
                onClick={handleCaptureButtonTap}
                className={cn(
                  "w-[72px] h-[72px] rounded-full border-[4px]",
                  "flex items-center justify-center",
                  "active:scale-90 transition-transform touch-none",
                  captureMode === "video"
                    ? isRecording
                      ? "border-red-400 bg-red-500 scale-110"
                      : "border-red-400"
                    : "border-white"
                )}
              >
                {captureMode === "video" && isRecording ? (
                  <div className="w-6 h-6 rounded-sm bg-white" />
                ) : captureMode === "video" ? (
                  <div className="w-[58px] h-[58px] rounded-full bg-red-500" />
                ) : (
                  <div className="w-[58px] h-[58px] rounded-full bg-white/90" />
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={retake}
              disabled={uploading}
              className="px-6 py-3 rounded-full bg-white/15 text-white font-medium active:scale-95 transition-transform backdrop-blur-sm"
            >
              Ta på nytt
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={uploading}
              className={cn(
                "px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold",
                "flex items-center gap-2 active:scale-95 transition-transform"
              )}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Publiser
            </button>
          </>
        )}
      </div>
    </div>
  );
};
