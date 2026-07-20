/**
 * GalleryScreen — Instagram-like private gallery.
 *
 * Uses signed URLs against the private buckets (chat-media, stories).
 * Direct upload with client-side re-encode + thumbnail (EXIF stripped).
 * Fullscreen viewer with uploader, caption, timestamp, like toggle, comments,
 * download and delete-own/admin.
 */

import * as React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { BackButton } from '@/components/layout/BackButton';
import { PullToRefreshWrapper } from '@/components/PullToRefreshWrapper';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BrandEmptyState } from '@/components/ui/brand-empty-state';
import { BrandSkeleton } from '@/components/ui/brand-skeleton';
import { Download, Play, Image as ImageIcon, Trash2, Heart, MessageCircle, Send, Plus, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { errorToast } from '@/utils/errorToast';
import { useSignedUrl } from '@/components/ui/SignedMedia';
import type { Bucket } from '@/lib/mediaUrl';
import { reencodeImage } from '@/lib/imageOptimize';
import { createThumbnail } from '@/utils/imageThumb';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

interface GalleryRow {
  id: string;
  storage_path: string;
  storage_bucket: Bucket;
  thumbnail_path: string | null;
  caption: string | null;
  type: string;
  created_at: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  source_message_id: string | null;
  source_story_id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
}

interface ProfileLite {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface CommentRow {
  id: string;
  item_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

const GridThumb: React.FC<{
  item: GalleryRow;
  onOpen: () => void;
}> = ({ item, onOpen }) => {
  const path = item.thumbnail_path || item.storage_path;
  const url = useSignedUrl(item.storage_bucket, path, null);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-square overflow-hidden rounded-sm bg-muted group"
      aria-label="Åpne bilde"
    >
      {url ? (
        <img src={url} alt={item.caption || item.type} className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="w-full h-full animate-pulse bg-muted" />
      )}
      {item.type !== 'image' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          {item.type === 'video'
            ? <Play size={24} className="text-white" />
            : <span className="text-white text-xs font-bold">GIF</span>}
        </div>
      )}
    </button>
  );
};

export const GalleryScreen: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = React.useState<GalleryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Record<string, ProfileLite>>({});
  const [likesByItem, setLikesByItem] = React.useState<Record<string, Set<string>>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchGallery = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('gallery_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      console.error('Error loading gallery:', error);
      setLoading(false);
      return;
    }
    const rows = (data as unknown as GalleryRow[]) || [];
    setItems(rows);

    // Fetch profiles + likes in parallel
    const userIds = [...new Set(rows.map((r) => r.uploaded_by))];
    const itemIds = rows.map((r) => r.id);
    const [profRes, likeRes] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('id, nickname, full_name, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] as ProfileLite[] }),
      itemIds.length
        ? supabase.from('gallery_likes').select('item_id, user_id').in('item_id', itemIds)
        : Promise.resolve({ data: [] as { item_id: string; user_id: string }[] }),
    ]);
    const pmap: Record<string, ProfileLite> = {};
    for (const p of (profRes.data || []) as ProfileLite[]) pmap[p.id] = p;
    setProfiles(pmap);
    const lmap: Record<string, Set<string>> = {};
    for (const l of (likeRes.data || []) as { item_id: string; user_id: string }[]) {
      (lmap[l.item_id] ??= new Set()).add(l.user_id);
    }
    setLikesByItem(lmap);
    setLoading(false);
  }, []);

  React.useEffect(() => { fetchGallery(); }, [fetchGallery]);

  React.useEffect(() => {
    const channel = supabase
      .channel('gallery-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, () => fetchGallery())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_likes' }, () => fetchGallery())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchGallery]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      errorToast('Filen er for stor (maks 20MB)');
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      errorToast('Kun bilde eller video støttes');
      return;
    }
    setUploading(true);
    try {
      const bucket: Bucket = 'chat-media';
      const fileId = crypto.randomUUID();
      let uploadBlob: Blob = file;
      let thumbPath: string | null = null;
      let mime = file.type;
      let width: number | null = null;
      let height: number | null = null;

      if (isImage) {
        // Re-encode strips EXIF and caps dimensions.
        uploadBlob = await reencodeImage(file, { maxDim: 2000, quality: 0.9 });
        mime = 'image/jpeg';
        // Thumbnail (also strips EXIF via canvas)
        try {
          const t = await createThumbnail(new File([uploadBlob], 'x.jpg', { type: 'image/jpeg' }));
          thumbPath = `${user.id}/${fileId}_thumb.jpg`;
          await supabase.storage.from(bucket).upload(thumbPath, t.thumbBlob, { contentType: 'image/jpeg' });
          width = t.width;
          height = t.height;
        } catch (e) {
          console.warn('thumb failed', e);
        }
      }

      const ext = isVideo
        ? (mime.includes('mp4') ? 'mp4' : mime.includes('webm') ? 'webm' : 'mp4')
        : 'jpg';
      const path = `${user.id}/${fileId}.${ext}`;

      const { error: upErr } = await supabase.storage.from(bucket).upload(path, uploadBlob, {
        contentType: mime,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('gallery_items').insert({
        storage_path: path,
        storage_bucket: bucket,
        thumbnail_path: thumbPath,
        type: isVideo ? 'video' : 'image',
        uploaded_by: user.id,
        mime_type: mime,
        size_bytes: uploadBlob.size,
        width,
        height,
      });
      if (insErr) throw insErr;
      toast.success('Lastet opp i galleriet');
      await fetchGallery();
    } catch (e) {
      console.error(e);
      errorToast('Opplasting feilet');
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) handleUpload(f);
  };

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: 'var(--app-height)' }}>
      <AppHeader
        title="Galleri"
        subtitle="Bilder, videoer og stories"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-primary text-primary-foreground"
            aria-label="Last opp bilde eller video"
            disabled={uploading}
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
          </button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPickFile}
      />

      <PullToRefreshWrapper
        onRefresh={async () => { setLoading(true); await fetchGallery(); }}
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{ paddingBottom: 'var(--bottom-nav-h-effective)', WebkitOverflowScrolling: 'touch' }}
      >
        {loading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <BrandSkeleton key={i} className="aspect-square rounded-sm" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <BrandEmptyState
              icon={ImageIcon}
              title="Ingen media ennå"
              description="Trykk + for å laste opp første bilde eller video."
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {items.map((item) => (
              <GridThumb key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </PullToRefreshWrapper>

      {selected && (
        <FullscreenViewer
          item={selected}
          profile={profiles[selected.uploaded_by]}
          likes={likesByItem[selected.id] || new Set()}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onDeleted={async () => { setSelectedId(null); await fetchGallery(); }}
        />
      )}
    </div>
  );
};

// ============= Fullscreen viewer =============
const FullscreenViewer: React.FC<{
  item: GalleryRow;
  profile?: ProfileLite;
  likes: Set<string>;
  currentUserId?: string;
  isAdmin: boolean;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}> = ({ item, profile, likes, currentUserId, isAdmin, onClose, onDeleted }) => {
  const url = useSignedUrl(item.storage_bucket, item.storage_path, null);
  const [comments, setComments] = React.useState<CommentRow[]>([]);
  const [commentDrafts, setDraft] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [commentProfiles, setCommentProfiles] = React.useState<Record<string, ProfileLite>>({});

  const liked = currentUserId ? likes.has(currentUserId) : false;
  const canDelete = currentUserId === item.uploaded_by || isAdmin;

  const fetchComments = React.useCallback(async () => {
    const { data } = await supabase
      .from('gallery_comments')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: true });
    const rows = (data as CommentRow[]) || [];
    setComments(rows);
    const uids = [...new Set(rows.map((c) => c.user_id))];
    if (uids.length) {
      const { data: p } = await supabase
        .from('profiles').select('id, nickname, full_name, avatar_url').in('id', uids);
      const m: Record<string, ProfileLite> = {};
      for (const row of (p || []) as ProfileLite[]) m[row.id] = row;
      setCommentProfiles(m);
    }
  }, [item.id]);

  React.useEffect(() => { fetchComments(); }, [fetchComments]);
  React.useEffect(() => {
    const ch = supabase
      .channel(`comments-${item.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'gallery_comments', filter: `item_id=eq.${item.id}` },
        () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [item.id, fetchComments]);

  const toggleLike = async () => {
    if (!currentUserId) return;
    if (liked) {
      await supabase.from('gallery_likes').delete().eq('item_id', item.id).eq('user_id', currentUserId);
    } else {
      await supabase.from('gallery_likes').insert({ item_id: item.id, user_id: currentUserId });
    }
  };

  const submitComment = async () => {
    if (!currentUserId || !commentDrafts.trim()) return;
    const body = commentDrafts.trim().slice(0, 500);
    setDraft('');
    const { error } = await supabase.from('gallery_comments').insert({
      item_id: item.id, user_id: currentUserId, body,
    });
    if (error) errorToast('Kunne ikke sende kommentar');
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from('gallery_comments').delete().eq('id', id);
    if (error) errorToast('Kunne ikke slette kommentar');
  };

  const handleDelete = async () => {
    // Best-effort: delete storage object only when we own the item AND this is
    // the last reference (attachments/stories may still point at it). Simplest
    // safe path: don't remove storage here — the row's gallery entry is what
    // users see; underlying media in chat/stories stays intact.
    const { error } = await supabase.from('gallery_items').delete().eq('id', item.id);
    if (error) return errorToast('Kunne ikke slette');
    toast.success('Slettet fra galleri');
    await onDeleted();
  };

  const handleDownload = async () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `guttahutte-${item.id.slice(0, 8)}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const displayName = profile?.nickname || profile?.full_name || 'Ukjent';
  const likeCount = likes.size;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback>{displayName[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {new Date(item.created_at).toLocaleString('nb-NO')}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Lukk">
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full bg-black flex items-center justify-center" style={{ minHeight: '40vh' }}>
          {!url ? (
            <Loader2 className="animate-spin text-white" />
          ) : item.type === 'video' ? (
            <video src={url} controls playsInline className="w-full max-h-[70vh]" />
          ) : (
            <img src={url} alt={item.caption || ''} className="w-full max-h-[70vh] object-contain" />
          )}
        </div>

        <div className="p-3 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleLike}
              className="flex items-center gap-1.5"
              aria-label={liked ? 'Fjern liker' : 'Liker'}
            >
              <Heart size={22} className={cn(liked && 'fill-red-500 text-red-500')} />
              <span className="text-sm">{likeCount}</span>
            </button>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageCircle size={20} />
              <span>{comments.length}</span>
            </div>
            <div className="flex-1" />
            <button type="button" onClick={handleDownload} className="p-2 rounded-full hover:bg-muted" aria-label="Last ned">
              <Download size={20} />
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-full hover:bg-muted text-destructive"
                aria-label="Slett"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>

          {item.caption && <p className="text-sm">{item.caption}</p>}

          <div className="space-y-2 pt-2 border-t border-border">
            {comments.map((c) => {
              const cp = commentProfiles[c.user_id];
              const cname = cp?.nickname || cp?.full_name || 'Ukjent';
              const mine = c.user_id === currentUserId || isAdmin;
              return (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar className="h-6 w-6 mt-0.5">
                    <AvatarImage src={cp?.avatar_url || undefined} />
                    <AvatarFallback>{cname[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm"><span className="font-semibold">{cname}</span> {c.body}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleString('nb-NO')}
                    </p>
                  </div>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => deleteComment(c.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Slett kommentar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submitComment(); }}
        className="border-t border-border p-2 flex items-center gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <input
          type="text"
          value={commentDrafts}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Kommenter…"
          className="flex-1 rounded-full border border-border px-3 py-2 text-sm bg-background"
        />
        <button
          type="submit"
          className="p-2 rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          disabled={!commentDrafts.trim()}
          aria-label="Send kommentar"
        >
          <Send size={18} />
        </button>
      </form>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett fra galleri?</AlertDialogTitle>
            <AlertDialogDescription>
              Bildet fjernes fra galleriet, men forblir i chatten eller storien.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GalleryScreen;
