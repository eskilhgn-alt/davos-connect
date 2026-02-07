/**
 * StoryCapture - Camera capture for creating stories
 * Supports photo and up to 60s video recording
 */

import * as React from "react";
import { X, Camera, Video, Square, Send, RotateCcw, Loader2 } from "lucide-react";
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
  const timerRef = React.useRef<ReturnType<typeof setInterval>>();

  const [mode, setMode] = React.useState<"camera" | "preview">("camera");
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordTime, setRecordTime] = React.useState(0);
  const [capturedMedia, setCapturedMedia] = React.useState<{ blob: Blob; type: "image" | "video"; url: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("environment");

  // Start camera
  const startCamera = React.useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
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
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setCapturedMedia({ blob, type: "image", url });
        setMode("preview");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    }, "image/jpeg", 0.85);
  };

  // Start video recording
  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm",
    });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setCapturedMedia({ blob, type: "video", url });
      setMode("preview");
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
    setRecordTime(0);

    timerRef.current = setInterval(() => {
      setRecordTime((t) => {
        if (t >= 60) {
          stopRecording();
          return t;
        }
        return t + 1;
      });
    }, 1000);
  };

  // Stop video recording
  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Flip camera
  const flipCamera = () => {
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  };

  // Discard and retake
  const retake = () => {
    if (capturedMedia) URL.revokeObjectURL(capturedMedia.url);
    setCapturedMedia(null);
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

      const { error: insertErr } = await supabase.from("stories").insert({
        user_id: user.id,
        storage_path: path,
        type: capturedMedia.type,
        duration_sec: capturedMedia.type === "video" ? recordTime : 0,
      });

      if (insertErr) throw insertErr;

      // Also add to gallery
      const { data: urlData } = supabase.storage.from("stories").getPublicUrl(path);
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute z-10 p-2 rounded-full bg-black/40 text-white"
        style={{ top: "max(env(safe-area-inset-top, 0px), 12px)", left: "12px" }}
      >
        <X size={24} />
      </button>

      {/* Flip camera button */}
      {mode === "camera" && (
        <button
          type="button"
          onClick={flipCamera}
          className="absolute z-10 p-2 rounded-full bg-black/40 text-white"
          style={{ top: "max(env(safe-area-inset-top, 0px), 12px)", right: "12px" }}
        >
          <RotateCcw size={24} />
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
            className="w-full h-full object-contain"
          />
        ) : (
          <img
            src={capturedMedia?.url}
            alt="Preview"
            className="w-full h-full object-contain"
          />
        )}

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white text-sm font-mono">
              {Math.floor(recordTime / 60).toString().padStart(2, "0")}:
              {(recordTime % 60).toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-center gap-8 py-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
      >
        {mode === "camera" ? (
          <>
            {/* Photo button */}
            <button
              type="button"
              onClick={takePhoto}
              disabled={isRecording}
              className={cn(
                "w-16 h-16 rounded-full border-4 border-white",
                "flex items-center justify-center",
                "active:scale-95 transition-transform",
                isRecording && "opacity-30"
              )}
            >
              <Camera size={24} className="text-white" />
            </button>

            {/* Record / Stop button */}
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Square size={24} className="text-white" fill="white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Video size={24} className="text-red-500" />
              </button>
            )}
          </>
        ) : (
          <>
            {/* Retake */}
            <button
              type="button"
              onClick={retake}
              disabled={uploading}
              className="px-6 py-3 rounded-full bg-white/20 text-white font-medium active:scale-95 transition-transform"
            >
              Ta på nytt
            </button>

            {/* Publish */}
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
