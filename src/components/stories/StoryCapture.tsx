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

  const MAX_RECORD_SECS = 60;

  // ─── Camera ───
  const startCamera = React.useCallback(async () => {
    try {
      setCameraError(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Request widest possible field of view
          ...(typeof MediaStreamTrack !== 'undefined' && {
            resizeMode: 'none',
          }),
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Force widest angle: set zoom to minimum
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as any;
      if (caps?.zoom) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as any] });
        } catch {}
      }
      setZoomLevel(1);
    } catch (err) {
      console.error("[StoryCapture] Camera error:", err);
      setCameraError(true);
    }
  }, [facingMode]);

  React.useEffect(() => {
    if (mode === "camera") startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, startCamera]);

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
        if (blob) {
          setCapturedMedia({ blob, type: "image", url: URL.createObjectURL(blob) });
          setMode("preview");
          streamRef.current?.getTracks().forEach((t) => t.stop());
        }
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

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
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
        toast.error("Video-opptak støttes ikke på denne enheten");
        return;
      }
    }
    const actualMime = recorder.mimeType || mimeType || "video/mp4";
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: actualMime });
      setCapturedMedia({ blob, type: "video", url: URL.createObjectURL(blob) });
      setMode("preview");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordTime(0);
    recordTimerRef.current = setInterval(() => {
      setRecordTime((t) => {
        if (t >= MAX_RECORD_SECS) {
          stopRecording();
          return t;
        }
        return t + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setIsRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  };

  // ─── Double-tap to start/stop recording, single tap for photo ───
  const lastCaptureTapRef = React.useRef(0);
  const captureTapTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const handleCaptureButtonTap = () => {
    if (mode !== "camera") return;
    const now = Date.now();
    if (now - lastCaptureTapRef.current < 400) {
      // Double tap
      if (captureTapTimerRef.current) clearTimeout(captureTapTimerRef.current);
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
      lastCaptureTapRef.current = 0;
    } else {
      lastCaptureTapRef.current = now;
      captureTapTimerRef.current = setTimeout(() => {
        if (lastCaptureTapRef.current === now && !isRecording) {
          takePhoto();
        }
      }, 400);
    }
  };

  const retake = () => {
    if (capturedMedia) URL.revokeObjectURL(capturedMedia.url);
    setCapturedMedia(null);
    setRecordTime(0);
    setTextOverlays([]);
    setDrawPaths([]);
    setEditMode("none");
    setCameraError(false);
    setMode("camera");
  };

  // ─── File input fallback ───
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video") ? "video" as const : "image" as const;
    const url = URL.createObjectURL(file);
    setCapturedMedia({ blob: file, type, url });
    setMode("preview");
    streamRef.current?.getTracks().forEach((t) => t.stop());
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

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
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

        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
      };
      img.src = capturedMedia.url;
    });
  };

  // ─── Publish ───
  const publish = async () => {
    if (!capturedMedia || !user) return;
    setUploading(true);

    try {
      // Render edits onto final image
      const finalBlob =
        capturedMedia.type === "image" && (textOverlays.length > 0 || drawPaths.length > 0)
          ? await renderFinalImage()
          : capturedMedia.blob;

      // Determine extension and content type from the blob
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
        });
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase.from("stories").insert({
        user_id: user.id,
        storage_path: path,
        type: capturedMedia.type,
        duration_sec: capturedMedia.type === "video" ? recordTime : 0,
      });
      if (insertErr) throw insertErr;

      await supabase.from("gallery_items").insert({
        storage_path: path,
        type: capturedMedia.type,
        uploaded_by: user.id,
      });

      // Send push to all other users
      const sess = await supabase.auth.getSession();
      const pushToken = sess.data.session?.access_token;
      if (pushToken) {
        const { data: prof } = await supabase.from("profiles").select("nickname, full_name").eq("id", user.id).single();
        const name = prof?.nickname || prof?.full_name || "Noen";
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pushToken}` },
          body: JSON.stringify({
            type: "new_story",
            heading: "📸 Ny story",
            message: `${name} har lagt ut en ${capturedMedia.type === "video" ? "video" : "bilde"}-story`,
            exclude_user_id: user.id,
            url: "https://davos-joy-connect.lovable.app/stories",
          }),
        }).catch(() => {});
      }

      toast.success("Story publisert! 🎉");
      URL.revokeObjectURL(capturedMedia.url);
      onPublished();
    } catch (err: any) {
      console.error("Publish error:", err);
      toast.error("Kunne ikke publisere story");
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
          className="p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          <X size={22} />
        </button>

        <div className="flex items-center gap-2">
          {mode === "camera" && (
            <>
              <button
                type="button"
                onClick={() => setFlashOn((f) => !f)}
                className="p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                {flashOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </button>
              <button
                type="button"
                onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))}
                className="p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                <RotateCcw size={20} />
              </button>
            </>
          )}
          {mode === "preview" && (
            <>
              {(textOverlays.length > 0 || drawPaths.length > 0) && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
                >
                  <Undo2 size={20} />
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
                className={cn(
                  "p-2.5 rounded-full backdrop-blur-sm",
                  editMode === "draw" ? "bg-white text-black" : "bg-black/50 text-white"
                )}
              >
                <Pencil size={20} />
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
                className={cn(
                  "p-2.5 rounded-full backdrop-blur-sm",
                  editMode === "text" ? "bg-white text-black" : "bg-black/50 text-white"
                )}
              >
                <Type size={20} />
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
            controls
            className="w-full h-full object-cover"
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
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-transform",
                  textColor === c ? "border-white scale-125" : "border-white/30"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Style toggle */}
          <div className="flex items-center justify-center gap-2">
            {(["bold", "outline", "bg"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTextStyle(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
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
              className="flex-1 px-4 py-3 rounded-full bg-white/15 text-white placeholder:text-white/40 backdrop-blur-sm border border-white/20 text-sm focus:outline-none focus:border-white/50"
            />
            <button
              type="button"
              onClick={addTextOverlay}
              disabled={!textInput.trim()}
              className="p-3 rounded-full bg-white text-black disabled:opacity-40"
            >
              <Check size={18} />
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
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-transform",
                drawColor === c ? "border-white scale-125" : "border-white/30"
              )}
              style={{ backgroundColor: c }}
            />
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
                  "w-[72px] h-[72px] rounded-full border-[4px] border-white",
                  "flex items-center justify-center",
                  "active:scale-90 transition-transform touch-none",
                  isRecording && "bg-red-500 border-red-400 scale-110"
                )}
              >
                {isRecording ? (
                  <div className="w-6 h-6 rounded-sm bg-white" />
                ) : (
                  <div className="w-[58px] h-[58px] rounded-full bg-white/90" />
                )}
              </button>
            </div>
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/50 text-[10px]">
              Trykk for foto · Dobbelttrykk for video
            </p>
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
