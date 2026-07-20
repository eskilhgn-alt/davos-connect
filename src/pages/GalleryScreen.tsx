/**
 * GalleryScreen — Instagram-like private gallery for the trip group.
 *
 * Architecture: pure logic lives in `@/features/gallery/helpers`; Supabase +
 * realtime glue in `@/features/gallery/useGallery`. This file composes the
 * hooks with UI (grid, upload sheet, viewer sheet, comment sheet, delete
 * dialog). All storage access goes through the signed-URL resolver — no
 * public URL fallback when a storage_path exists.
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import {
  Download, Play, Image as ImageIcon, Trash2, Heart, MessageCircle, Send,
  Plus, X, Loader2, ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { SignedImg, SignedVideo, useSignedMedia } from "@/components/ui/SignedMedia";
import { signBatch, type Bucket } from "@/lib/mediaUrl";
import { reencodeImage } from "@/lib/imageOptimize";
import { createThumbnail } from "@/utils/imageThumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useGalleryFeed, useGalleryLikes, useGalleryComments } from "@/features/gallery/useGallery";
import type { GalleryRow, ProfileLite } from "@/features/gallery/types";
import {
  decideDeleteMode, nextViewerIndex, ownedCleanupPaths, videoPosterFallback,
} from "@/features/gallery/helpers";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_ALLOW = /^image\/(jpeg|png|webp|heic|heif|gif)$/i;
const VIDEO_MIME_ALLOW = /^video\/(mp4|webm|quicktime)$/i;

// ─── Grid thumbnail ────────────────────────────────────────────────────────
const GridThumb: React.FC<{ item: GalleryRow; onOpen: () => void }> = ({ item, onOpen }) => {
  const path = item.thumbnail_path || item.storage_path;
  const { useFallback } = videoPosterFallback(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-square overflow-hidden rounded-sm bg-muted"
      aria-label="Åpne bilde"
    >
      {useFallback ? (
        <div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
          <Play size={28} className="text-foreground/70" aria-hidden />
        </div>
      ) : (
        <SignedImg
          bucket={item.storage_bucket}
          path={path}
          alt={item.caption || item.type}
          className="w-full h-full object-cover"
        />
      )}
      {item.type === "video" && !useFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
          <Play size={24} className="text-white" aria-hidden />
        </div>
      )}
      {item.type === "gif" && (
        <div className="absolute bottom-1 right-1 rounded-sm bg-black/60 px-1 text-[10px] font-bold text-white">GIF</div>
      )}
    </button>
  );
};

// ─── Upload sheet ─────────────────────────────────────────────────────────
type UploadPhase = "idle" | "preparing" | "uploading" | "publishing" | "error";

const UploadSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  userId: string;
  historicalPaths: ReadonlySet<string>;
}> = ({ open, onClose, userId, historicalPaths }) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState("");
  const [phase, setPhase] = React.useState<UploadPhase>("idle");
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const attemptPaths = React.useRef<string[]>([]);

  React.useEffect(() => {
    if (!open) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null); setPreviewUrl(null); setCaption(""); setPhase("idle"); setErrMsg(null);
      attemptPaths.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (f.size === 0) { errorToast("Filen er tom"); return; }
    if (f.size > MAX_UPLOAD_BYTES) { errorToast("Filen er for stor (maks 20 MB)"); return; }
    const isImg = IMAGE_MIME_ALLOW.test(f.type);
    const isVid = VIDEO_MIME_ALLOW.test(f.type);
    if (!isImg && !isVid) { errorToast("Filtype ikke støttet"); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f); setPreviewUrl(URL.createObjectURL(f)); setCaption("");
  };

  const cleanupAttempt = async () => {
    const paths = ownedCleanupPaths(attemptPaths.current, historicalPaths);
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from("chat-media").remove(paths);
    if (error) toast.warning("Rydding etter feilet opplasting mislyktes");
    attemptPaths.current = [];
  };

  const publish = async () => {
    if (!file) return;
    setPhase("preparing"); setErrMsg(null);
    attemptPaths.current = [];
    try {
      const bucket: Bucket = "chat-media";
      const fileId = crypto.randomUUID();
      const isVideo = file.type.startsWith("video/");
      let uploadBlob: Blob = file;
      let thumbPath: string | null = null;
      let mime = file.type;
      let width: number | null = null;
      let height: number | null = null;

      if (!isVideo) {
        uploadBlob = await reencodeImage(file, { maxDim: 2000, quality: 0.9 });
        mime = "image/jpeg";
        if (uploadBlob.size === 0 || uploadBlob.size > MAX_UPLOAD_BYTES) {
          throw new Error("Re-encoded fil har ugyldig størrelse");
        }
        try {
          const t = await createThumbnail(new File([uploadBlob], "x.jpg", { type: "image/jpeg" }));
          thumbPath = `${userId}/${fileId}_thumb.jpg`;
          const up = await supabase.storage.from(bucket).upload(thumbPath, t.thumbBlob, { contentType: "image/jpeg" });
          if (up.error) throw up.error;
          attemptPaths.current.push(thumbPath);
          width = t.width; height = t.height;
        } catch (e) {
          console.warn("thumb failed", e);
          thumbPath = null;
        }
      }
      // Video: try metadata + poster later (browser variability). For now
      // upload without poster; grid uses fallback tile.

      setPhase("uploading");
      const ext = isVideo
        ? (mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4")
        : "jpg";
      const mainPath = `${userId}/${fileId}.${ext}`;
      const upMain = await supabase.storage.from(bucket).upload(mainPath, uploadBlob, { contentType: mime });
      if (upMain.error) throw upMain.error;
      attemptPaths.current.push(mainPath);

      setPhase("publishing");
      const { error: insErr } = await supabase.from("gallery_items").insert({
        storage_path: mainPath,
        storage_bucket: bucket,
        thumbnail_path: thumbPath,
        type: isVideo ? "video" : "image",
        uploaded_by: userId,
        mime_type: mime,
        size_bytes: uploadBlob.size,
        width, height,
        caption: caption.trim() || null,
      });
      if (insErr) throw insErr;
      toast.success("Delt i galleriet");
      attemptPaths.current = [];
      onClose();
    } catch (e) {
      console.error(e);
      setErrMsg((e as Error).message || "Opplasting feilet");
      setPhase("error");
      await cleanupAttempt();
    }
  };

  if (!open) return null;
  const busy = phase !== "idle" && phase !== "error";
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col"
         style={{ paddingTop: "env(safe-area-inset-top)" }} role="dialog" aria-modal="true"
         aria-label="Last opp til galleri">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <button type="button" onClick={onClose} disabled={busy}
                className="min-h-11 min-w-11 rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40"
                aria-label="Avbryt">
          <X size={22} />
        </button>
        <h2 className="text-sm font-semibold">Nytt innlegg</h2>
        <button type="button" onClick={publish} disabled={!file || busy}
                className="min-h-11 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">
          Del
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!file ? (
          <button type="button" onClick={() => inputRef.current?.click()}
                  className="w-full aspect-square rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:bg-muted/40">
            <Plus size={32} aria-hidden />
            <span className="text-sm">Velg bilde eller video</span>
          </button>
        ) : previewUrl ? (
          <div className="rounded-md overflow-hidden bg-muted">
            {file.type.startsWith("video/") ? (
              <video src={previewUrl} className="w-full max-h-[50vh]" playsInline muted controls />
            ) : (
              <img src={previewUrl} alt="Forhåndsvisning" className="w-full max-h-[50vh] object-contain" />
            )}
          </div>
        ) : null}

        <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />

        {file && (
          <div>
            <label htmlFor="gallery-caption" className="text-xs text-muted-foreground">Bildetekst (valgfri)</label>
            <textarea id="gallery-caption" maxLength={500} value={caption}
                      onChange={(e) => setCaption(e.target.value)} rows={3}
                      className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm resize-none"
                      placeholder="Skriv noe om bildet…" />
            <div className="text-right text-[11px] text-muted-foreground">{caption.length}/500</div>
          </div>
        )}

        {phase !== "idle" && phase !== "error" && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            <span>
              {phase === "preparing" && "Forbereder…"}
              {phase === "uploading" && "Laster opp…"}
              {phase === "publishing" && "Publiserer…"}
            </span>
          </div>
        )}
        {phase === "error" && errMsg && (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5" aria-hidden />
            <span>{errMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Comment sheet ────────────────────────────────────────────────────────
const CommentSheet: React.FC<{
  open: boolean; onClose: () => void; item: GalleryRow;
  currentUserId: string | undefined; isAdmin: boolean;
  profiles: Record<string, ProfileLite>;
}> = ({ open, onClose, item, currentUserId, isAdmin, profiles }) => {
  const { comments, state, error, submit, retry, remove, reload } = useGalleryComments(open ? item.id : null, currentUserId);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  if (!open) return null;
  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    try {
      await submit(body);
      setDraft(""); // only clear once optimistic row exists
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col" role="dialog" aria-modal="true"
         style={{ paddingTop: "env(safe-area-inset-top)" }} aria-label="Kommentarer">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-semibold">Kommentarer</h3>
        <button type="button" onClick={onClose}
                className="min-h-11 min-w-11 rounded-full flex items-center justify-center hover:bg-muted"
                aria-label="Lukk kommentarer">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {state === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Laster kommentarer…
          </div>
        )}
        {state === "error" && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle size={14} aria-hidden />
            <span>{error || "Kunne ikke laste kommentarer"}</span>
            <button type="button" onClick={() => void reload()} className="underline">Prøv igjen</button>
          </div>
        )}
        {comments.length === 0 && state === "loaded" && (
          <p className="text-sm text-muted-foreground">Ingen kommentarer ennå.</p>
        )}
        {comments.map((c) => {
          const p = profiles[c.user_id];
          const name = p?.nickname || p?.full_name || "Ukjent";
          const mine = c.user_id === currentUserId;
          const canDel = mine || isAdmin;
          return (
            <div key={c.kind === "server" ? `s-${c.id}` : `o-${c.clientId}`} className="flex items-start gap-2">
              <Avatar className="h-7 w-7 mt-0.5">
                <AvatarImage src={p?.avatar_url || undefined} />
                <AvatarFallback>{name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{name}</span> {c.body}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{new Date(c.created_at).toLocaleString("nb-NO")}</span>
                  {c.kind === "optimistic" && c.state === "pending" && <span aria-live="polite">Sender…</span>}
                  {c.kind === "optimistic" && c.state === "failed" && (
                    <>
                      <span className="text-destructive" role="status">Feilet</span>
                      <button type="button" onClick={() => void retry(c.clientId)} className="underline">Prøv igjen</button>
                    </>
                  )}
                </div>
              </div>
              {c.kind === "server" && canDel && (
                <button type="button" onClick={() => remove(c.id).catch(() => errorToast("Kunne ikke slette"))}
                        className="min-h-9 min-w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive"
                        aria-label="Slett kommentar">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="border-t border-border p-2 flex items-center gap-2"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
        <input type="text" value={draft} maxLength={500}
               onChange={(e) => setDraft(e.target.value)}
               placeholder="Kommenter…"
               className="flex-1 rounded-full border border-border px-3 py-2 text-sm bg-background" />
        <button type="submit" disabled={!draft.trim() || sending}
                className="min-h-11 min-w-11 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40"
                aria-label="Send kommentar">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

// ─── Delete dialog ────────────────────────────────────────────────────────
const DeleteDialog: React.FC<{
  open: boolean;
  onCancel: () => void;
  item: GalleryRow;
  onConfirmed: () => void | Promise<void>;
}> = ({ open, onCancel, item, onConfirmed }) => {
  const mode = decideDeleteMode(item);
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === "derived" ? "Fjern fra galleri?" : "Slett fra galleri?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "derived"
              ? "Originalen forblir i chat eller stories."
              : "Bildet fjernes permanent fra galleriet."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirmed()}
                             className="bg-destructive text-destructive-foreground">
            {mode === "derived" ? "Fjern" : "Slett"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// ─── Viewer ────────────────────────────────────────────────────────────────
const ViewerSheet: React.FC<{
  items: GalleryRow[];
  startId: string;
  onClose: () => void;
  profiles: Record<string, ProfileLite>;
  likes: ReadonlyMap<string, ReadonlySet<string>>;
  commentCounts: ReadonlyMap<string, number>;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onToggleLike: (id: string) => Promise<void>;
  onDeleted: (id: string) => void;
}> = ({ items, startId, onClose, profiles, likes, commentCounts, currentUserId, isAdmin, onToggleLike, onDeleted }) => {
  const [currentId, setCurrentId] = React.useState(startId);
  const [showComments, setShowComments] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const item = items.find((i) => i.id === currentId) ?? null;

  const { url } = useSignedMedia(item?.storage_bucket ?? "chat-media", item?.storage_path ?? "", null);

  // Prefetch neighbours through the shared signed resolver.
  React.useEffect(() => {
    if (!item) return;
    const prev = nextViewerIndex(items, currentId, -1);
    const next = nextViewerIndex(items, currentId, 1);
    const buckets = new Map<Bucket, string[]>();
    for (const n of [prev, next]) {
      if (!n) continue;
      const path = n.storage_path;
      const arr = buckets.get(n.storage_bucket) ?? [];
      arr.push(path);
      buckets.set(n.storage_bucket, arr);
    }
    for (const [b, paths] of buckets) void signBatch(b, paths);
  }, [items, currentId, item]);

  // Keyboard navigation.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft") { const p = nextViewerIndex(items, currentId, -1); if (p) setCurrentId(p.id); }
      if (e.key === "ArrowRight") { const n = nextViewerIndex(items, currentId, 1); if (n) setCurrentId(n.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, currentId, onClose]);

  // Basic horizontal swipe.
  const touchRef = React.useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current; touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      const n = nextViewerIndex(items, currentId, dir);
      if (n) setCurrentId(n.id);
    }
  };

  if (!item) return null;
  const profile = profiles[item.uploaded_by];
  const displayName = profile?.nickname || profile?.full_name || "Ukjent";
  const likeSet = likes.get(item.id) ?? new Set<string>();
  const liked = currentUserId ? likeSet.has(currentUserId) : false;
  const canDelete = currentUserId === item.uploaded_by || isAdmin;

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `guttahutte-${item.id.slice(0, 8)}`;
    a.target = "_blank"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const performDelete = async () => {
    const mode = decideDeleteMode(item);
    const { error } = await supabase.from("gallery_items").delete().eq("id", item.id);
    if (error) { errorToast("Kunne ikke slette"); setConfirmDelete(false); return; }
    if (mode === "direct") {
      const paths = [item.storage_path, item.thumbnail_path].filter(Boolean) as string[];
      const { error: rmErr } = await supabase.storage.from(item.storage_bucket).remove(paths);
      if (rmErr) toast.warning("Rad slettet, men filrydding feilet");
    }
    setConfirmDelete(false);
    toast.success(mode === "direct" ? "Slettet fra galleri" : "Fjernet fra galleri");
    onDeleted(item.id);
    const next = nextViewerIndex(items, item.id, 1) ?? nextViewerIndex(items, item.id, -1);
    if (next) setCurrentId(next.id); else onClose();
  };

  const prevItem = nextViewerIndex(items, currentId, -1);
  const nextItem = nextViewerIndex(items, currentId, 1);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col"
         style={{ paddingTop: "env(safe-area-inset-top)" }}
         role="dialog" aria-modal="true" aria-label="Galleri-visning">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback>{displayName[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {new Date(item.created_at).toLocaleString("nb-NO")}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose}
                className="min-h-11 min-w-11 rounded-full flex items-center justify-center hover:bg-muted"
                aria-label="Lukk">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative w-full bg-black flex items-center justify-center" style={{ minHeight: "40vh" }}>
          {!url ? (
            <div className="flex flex-col items-center gap-2 text-white p-8">
              <Loader2 className="animate-spin" aria-hidden />
              <span className="text-xs">Laster…</span>
            </div>
          ) : item.type === "video" ? (
            <video src={url} controls playsInline preload="metadata" className="w-full max-h-[70vh]" />
          ) : (
            <img src={url} alt={item.caption || ""} className="w-full max-h-[70vh] object-contain" />
          )}
          {prevItem && (
            <button type="button" onClick={() => setCurrentId(prevItem.id)}
                    className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 rounded-full bg-black/40 text-white items-center justify-center"
                    aria-label="Forrige">
              <ChevronLeft size={20} />
            </button>
          )}
          {nextItem && (
            <button type="button" onClick={() => setCurrentId(nextItem.id)}
                    className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 min-h-11 min-w-11 rounded-full bg-black/40 text-white items-center justify-center"
                    aria-label="Neste">
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        <div className="p-3 space-y-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onToggleLike(item.id).catch(() => errorToast("Kunne ikke like"))}
                    className="min-h-11 min-w-11 flex items-center gap-1.5"
                    aria-label={liked ? "Fjern liker" : "Liker"} aria-pressed={liked}>
              <Heart size={22} className={cn(liked && "fill-red-500 text-red-500")} />
              <span className="text-sm">{likeSet.size}</span>
            </button>
            <button type="button" onClick={() => setShowComments(true)}
                    className="min-h-11 flex items-center gap-1.5 text-sm text-muted-foreground"
                    aria-label="Kommentarer">
              <MessageCircle size={20} />
              <span>{commentCounts.get(item.id) ?? 0}</span>
            </button>
            <div className="flex-1" />
            <button type="button" onClick={handleDownload}
                    className="min-h-11 min-w-11 rounded-full hover:bg-muted flex items-center justify-center"
                    aria-label="Last ned">
              <Download size={20} />
            </button>
            {canDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)}
                      className="min-h-11 min-w-11 rounded-full hover:bg-muted text-destructive flex items-center justify-center"
                      aria-label="Slett">
                <Trash2 size={20} />
              </button>
            )}
          </div>
          {item.caption && <p className="text-sm">{item.caption}</p>}
        </div>
      </div>

      <CommentSheet open={showComments} onClose={() => setShowComments(false)}
                    item={item} currentUserId={currentUserId} isAdmin={isAdmin} profiles={profiles} />
      <DeleteDialog open={confirmDelete} onCancel={() => setConfirmDelete(false)}
                    item={item} onConfirmed={performDelete} />
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────
export const GalleryScreen: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const feed = useGalleryFeed();
  const { view: likeView, toggle: toggleLike } = useGalleryLikes(feed.likes, user?.id);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [viewerStart, setViewerStart] = React.useState<string | null>(null);

  // Historical storage paths (all currently-seen items) — never touched by
  // upload cleanup even if a caller passes them.
  const historicalPaths = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of feed.items) {
      s.add(r.storage_path);
      if (r.thumbnail_path) s.add(r.thumbnail_path);
    }
    return s;
  }, [feed.items]);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Galleri"
        subtitle="Bilder, videoer og stories"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          <button type="button" onClick={() => setUploadOpen(true)}
                  className="min-h-11 min-w-11 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
                  aria-label="Last opp bilde eller video">
            <Plus size={20} />
          </button>
        }
      />

      <PullToRefreshWrapper
        onRefresh={async () => { await feed.refresh(); }}
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        {feed.state === "loading" && feed.items.length === 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <BrandSkeleton key={i} className="aspect-square rounded-sm" />
            ))}
          </div>
        ) : feed.state === "error" && feed.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[50vh] text-center">
            <AlertCircle size={32} className="text-destructive" aria-hidden />
            <p className="text-sm">{feed.error || "Kunne ikke laste galleri"}</p>
            <button type="button" onClick={() => void feed.refresh()}
                    className="min-h-11 px-4 rounded-full border border-border flex items-center gap-2">
              <RefreshCw size={16} aria-hidden /> Prøv igjen
            </button>
          </div>
        ) : feed.items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <BrandEmptyState icon={ImageIcon} title="Ingen media ennå"
                             description="Trykk + for å laste opp første bilde eller video." />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1">
              {feed.items.map((item) => (
                <GridThumb key={item.id} item={item} onOpen={() => setViewerStart(item.id)} />
              ))}
            </div>
            {feed.hasMore && (
              <div className="flex justify-center pt-4">
                <button type="button" onClick={() => void feed.loadMore()}
                        className="min-h-11 px-4 rounded-full border border-border text-sm">
                  Last inn mer
                </button>
              </div>
            )}
            {feed.error && feed.items.length > 0 && (
              <div role="status" className="mt-2 text-center text-xs text-destructive">
                {feed.error}
              </div>
            )}
          </>
        )}
      </PullToRefreshWrapper>

      {user && (
        <UploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)}
                     userId={user.id} historicalPaths={historicalPaths} />
      )}

      {viewerStart && (
        <ViewerSheet
          items={feed.items}
          startId={viewerStart}
          onClose={() => setViewerStart(null)}
          profiles={feed.profiles}
          likes={likeView}
          commentCounts={feed.commentCounts}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          onToggleLike={toggleLike}
          onDeleted={(id) => feed.applyLocalDelete(id)}
        />
      )}
    </div>
  );
};

export default GalleryScreen;
