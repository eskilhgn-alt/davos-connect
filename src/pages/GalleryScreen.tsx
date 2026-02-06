import * as React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { supabase } from '@/integrations/supabase/client';
import { MediaViewer } from '@/components/ui/MediaViewer';
import { DavosEmptyState } from '@/components/ui/davos-empty-state';
import { DavosSkeleton } from '@/components/ui/davos-skeleton';
import { Download, Play, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [items, setItems] = React.useState<GalleryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedItem, setSelectedItem] = React.useState<GalleryRow | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);

  // Fetch gallery items from Supabase
  React.useEffect(() => {
    const load = async () => {
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
    };
    load();
  }, []);

  const getPublicUrl = (storagePath: string) => {
    const { data } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
    return data.publicUrl;
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
    a.download = `davos-${item.type}-${item.id.slice(0, 8)}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
      <AppHeader title="Galleri" subtitle="Delte bilder og videoer" />

      <div
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <DavosSkeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosEmptyState
              icon={ImageIcon}
              title="Ingen media ennå"
              description="Bilder, videoer og GIF-er delt i chatten vil vises her."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((item) => {
              const thumbUrl = getPublicUrl(item.storage_path);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openViewer(item)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg",
                    "bg-muted hover:opacity-90 transition-opacity",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  )}
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

                  <button
                    type="button"
                    onClick={(e) => handleDownload(item, e)}
                    className={cn(
                      "absolute bottom-2 right-2 p-1.5 rounded-full",
                      "bg-black/50 hover:bg-black/70 transition-colors",
                      "text-white"
                    )}
                    title="Last ned"
                  >
                    <Download size={16} />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedItem && (
        <MediaViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          src={getPublicUrl(selectedItem.storage_path)}
          type={selectedItem.type as 'image' | 'video' | 'gif'}
        />
      )}
    </div>
  );
};

export default GalleryScreen;
