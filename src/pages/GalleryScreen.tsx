import * as React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { galleryService, type GalleryItem } from '@/services/gallery.local';
import { mediaStorage } from '@/services/media-storage';
import { MediaViewerModal } from '@/components/chat/MediaViewerModal';
import { DavosEmptyState } from '@/components/ui/davos-empty-state';
import { Download, Play, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const GalleryScreen: React.FC = () => {
  const [items, setItems] = React.useState<GalleryItem[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = React.useState<Record<string, string>>({});
  const [selectedItem, setSelectedItem] = React.useState<GalleryItem | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [fullUrl, setFullUrl] = React.useState<string | null>(null);
  
  // Track blob URLs for cleanup
  const blobUrlsRef = React.useRef<Set<string>>(new Set());

  // Load gallery items
  React.useEffect(() => {
    setItems(galleryService.getGalleryItems());
  }, []);

  // Load thumbnail URLs
  React.useEffect(() => {
    let isMounted = true;
    
    const loadThumbnails = async () => {
      const urls: Record<string, string> = {};
      
      for (const item of items) {
        const urlToResolve = item.thumbUrl || item.url;
        const url = await mediaStorage.getMediaUrl(urlToResolve);
        if (url && isMounted) {
          urls[item.id] = url;
          if (url.startsWith('blob:')) {
            blobUrlsRef.current.add(url);
          }
        }
      }
      
      if (isMounted) {
        setThumbnailUrls(urls);
      }
    };
    
    if (items.length > 0) {
      loadThumbnails();
    }
    
    return () => {
      isMounted = false;
    };
  }, [items]);

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  const openViewer = async (item: GalleryItem) => {
    const url = await mediaStorage.getMediaUrl(item.url);
    if (url) {
      if (url.startsWith('blob:')) {
        blobUrlsRef.current.add(url);
      }
      setFullUrl(url);
      setSelectedItem(item);
      setViewerOpen(true);
    }
  };

  const handleDownload = async (item: GalleryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const url = await mediaStorage.getMediaUrl(item.url);
    if (!url) return;
    
    // Create temporary download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `davos-${item.type}-${item.id.slice(0, 8)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Revoke blob URL after short delay
    if (url.startsWith('blob:')) {
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    }
  };

  const getTypeIcon = (type: GalleryItem['type']) => {
    switch (type) {
      case 'video':
        return <Play size={24} className="text-white" />;
      case 'gif':
        return <span className="text-white text-xs font-bold">GIF</span>;
      default:
        return null;
    }
  };

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Galleri" subtitle="Lokalt på denne enheten" />
      
      <div 
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosEmptyState
              icon={ImageIcon}
              title="Ingen media ennå"
              description="Bilder, videoer og GIF-er du deler i chatten vil vises her."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((item) => {
              const thumbUrl = thumbnailUrls[item.id];
              
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
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`${item.type}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Type indicator */}
                  {item.type !== 'image' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      {getTypeIcon(item.type)}
                    </div>
                  )}
                  
                  {/* Download button */}
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

      {/* Media viewer modal */}
      {selectedItem && fullUrl && (
        <MediaViewerModal
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          src={fullUrl}
          type={selectedItem.type}
        />
      )}
    </div>
  );
};

export default GalleryScreen;
