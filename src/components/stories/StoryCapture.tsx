/**
 * StoryCapture – Snapchat-style camera capture
 * - Tap for photo
 * - Hold for video (up to 60s)
 * - Progress ring around capture button during recording
 * - Front/back camera toggle
 */

import * as React from "react";
import { X, RotateCcw, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface StoryCaptureProps {
  onClose: () => void;
  onPublished: () => void;
}

export const StoryCapture: React.FC<StoryCaptureProps> = ({ onClose, onPublished }) => {
  const { user } = useAuth();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const holdTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval>>();

  const [mode, setMode] = React.useState<"camera" | "preview">("camera");
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordTime, setRecordTime] = React.useState(0);
  const [capturedMedia, setCapturedMedia] = React.useState<{
    blob: Blob;
    type: "image" | "video";
    url: string;
  } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("environment");

  const MAX_RECORD_SECS = 60;

  // Start camera
  const startCamera = React.useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast.error("Kunne ikke åpne kamera");
    }
  }, [facingMode]);

  React.useEffect(() => {
    if (mode === "camera") startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, startCamera]);

  // Take photo
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
      0.85
    );
  };

  // Start recording
  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
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

  // Hold-to-record: pointerdown starts timer, if held >300ms → record, else photo
  const handlePointerDown = () => {
    if (mode !== "camera") return;
    holdTimerRef.current = setTimeout(() => {
      startRecording();
    }, 300);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = undefined;
    }
    if (isRecording) {
      stopRecording();
    } else if (mode === "camera") {
      takePhoto();
    }
  };

  const retake = () => {
    if (capturedMedia) URL.revokeObjectURL(capturedMedia.url);
    setCapturedMedia(null);
    setRecordTime(0);
    setMode("camera");
  };

  // Publish story
  const publish = async () => {
    if (!capturedMedia || !user) return;
    setUploading(true);

    try {
      const ext = capturedMedia.type === "video" ? "webm" : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("stories")
        .upload(path, capturedMedia.blob, {
          contentType: capturedMedia.type === "video" ? "video/webm" : "image/jpeg",
        });
      if (uploadErr) throw uploadErr;

      // Insert story
      const { error: insertErr } = await supabase.from("stories").insert({
        user_id: user.id,
        storage_path: path,
        type: capturedMedia.type,
        duration_sec: capturedMedia.type === "video" ? recordTime : 0,
      });
      if (insertErr) throw insertErr;

      // Also add to gallery
      await supabase.from("gallery_items").insert({
        storage_path: path,
        type: capturedMedia.type,
        uploaded_by: user.id,
      });

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

  // Progress ring for recording
  const ringProgress = recordTime / MAX_RECORD_SECS;
  const ringSize = 88;
  const ringStroke = 4;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute z-10 p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
        style={{ top: "max(env(safe-area-inset-top, 0px), 12px)", left: "12px" }}
      >
        <X size={22} />
      </button>

      {/* Flip camera */}
      {mode === "camera" && (
        <button
          type="button"
          onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))}
          className="absolute z-10 p-2.5 rounded-full bg-black/50 text-white backdrop-blur-sm"
          style={{ top: "max(env(safe-area-inset-top, 0px), 12px)", right: "12px" }}
        >
          <RotateCcw size={22} />
        </button>
      )}

      {/* Camera / Preview */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {mode === "camera" ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : capturedMedia?.type === "video" ? (
          <video
            src={capturedMedia.url}
            autoPlay
            playsInline
            loop
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={capturedMedia?.url}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        )}

        {/* Recording time badge */}
        {isRecording && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-red-600/90 rounded-full backdrop-blur-sm">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white text-sm font-mono tabular-nums">
              {Math.floor(recordTime / 60)
                .toString()
                .padStart(2, "0")}
              :{(recordTime % 60).toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-center gap-6 py-5"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}
      >
        {mode === "camera" ? (
          <>
            {/* Snapchat-style capture button: tap = photo, hold = video */}
            <div className="relative flex items-center justify-center">
              {/* Progress ring during recording */}
              {isRecording && (
                <svg
                  width={ringSize}
                  height={ringSize}
                  className="absolute -rotate-90"
                >
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth={ringStroke}
                  />
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={ringStroke}
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringCircumference * (1 - ringProgress)}
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <button
                type="button"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
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
              Trykk for foto · Hold for video
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
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              Publiser
            </button>
          </>
        )}
      </div>
    </div>
  );
};
