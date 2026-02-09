import * as React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { BackButton } from '@/components/layout/BackButton';
import { PullToRefreshWrapper } from '@/components/PullToRefreshWrapper';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MediaViewer } from '@/components/ui/MediaViewer';
import { DavosEmptyState } from '@/components/ui/davos-empty-state';
import { DavosSkeleton } from '@/components/ui/davos-skeleton';
import { Download, Play, Image as ImageIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface GalleryRow {
  id: string;
  storage_path: string;
  type: string;
  created_at: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  source_message_id: string | null;
}

export const GalleryScreen: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = React.useState<GalleryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedItem, setSelectedItem] = React.useState<GalleryRow | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<GalleryRow | null>(null);

  const fetchGallery = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('gallery_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error loading gallery:', error);
    } else {
      setItems((data as GalleryRow[]) || []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Realtime: listen for new gallery inserts
  React.useEffect(() => {
    const channel = supabase
      .channel('gallery-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_items' }, () => {
        fetchGallery();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchGallery]);

  const getPublicUrl = (storagePath: string) => {
    // Stories are in "stories" bucket, chat media in "chat-media"
    // Story paths start with userId/uuid.ext and were uploaded to stories bucket
    // Chat paths also start with userId/uuid.ext but to chat-media bucket
    // We check if this gallery item came from stories bucket by checking source_message_id
    // For simplicity: try chat-media first (most common)
    const { data } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const getPublicUrlForItem = (item: GalleryRow) => {
    // If no source_message_id, it's likely from stories
    if (!item.source_message_id) {
      const { data } = supabase.storage.from('stories').getPublicUrl(item.storage_path);
      return data.publicUrl;
    }
    return getPublicUrl(item.storage_path);
  };

  const openViewer = (item: GalleryRow) => {
    setSelectedItem(item);
    setViewerOpen(true);
  };

  const handleDownload = async (item: GalleryRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getPublicUrl(item.storage_path);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guttahutte-${item.type}-${item.id.slice(0, 8)}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('gallery_items')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error('Kunne ikke slette');
    } else {
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      toast.success('Slettet fra galleri');
    }
    setDeleteTarget(null);
  };

  const canDelete = (item: GalleryRow) => item.uploaded_by === user?.id || isAdmin;

  const getTypeIcon = (type: string) => {
    if (type === 'video') return <Play size={24} className="text-white" />;
    if (type === 'gif') return <span className="text-white text-xs font-bold">GIF</span>;
    return null;
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Galleri" subtitle="Bilder, videoer og stories" leftAction={<BackButton fallbackPath="/hjem" />} />

      <PullToRefreshWrapper
        onRefresh={async () => { setLoading(true); await fetchGallery(); }}
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {loading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <DavosSkeleton key={i} className="aspect-square rounded-sm" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosEmptyState
              icon={ImageIcon}
              title="Ingen media ennå"
              description="Bilder, videoer og stories vil vises her."
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {items.map((item) => {
              const thumbUrl = getPublicUrlForItem(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openViewer(item)}
                  className="relative aspect-square overflow-hidden rounded-sm bg-muted group"
                >
                  <img
                    src={thumbUrl}
                    alt={item.type}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {item.type !== 'image' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      {getTypeIcon(item.type)}
                    </div>
                  )}

                  {/* Action buttons – visible on hover/touch */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-1 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleDownload(item, e)}
                      className="p-1.5 rounded-full bg-black/40 text-white"
                    >
                      <Download size={14} />
                    </button>
                    {canDelete(item) && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                        className="p-1.5 rounded-full bg-red-600/80 text-white"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </PullToRefreshWrapper>

      {selectedItem && (
        <MediaViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          src={getPublicUrlForItem(selectedItem)}
          type={selectedItem.type as 'image' | 'video' | 'gif'}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett fra galleri?</AlertDialogTitle>
            <AlertDialogDescription>
              Bildet fjernes fra galleriet, men forblir i chatten.
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
