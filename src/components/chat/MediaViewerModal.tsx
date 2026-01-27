import * as React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mediaStorage } from '@/services/media-storage';

interface MediaViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  type: 'image' | 'gif' | 'video';
  alt?: string;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  open,
  onOpenChange,
  src,
  type,
  alt = 'Media',
}) => {
  const [zoom, setZoom] = React.useState(1);
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(null);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 0.5));
  const handleReset = () => setZoom(1);

  // Resolve media URL (handles indexed-db:// URLs)
  React.useEffect(() => {
    let cancelled = false;
    
    const resolveUrl = async () => {
      const url = await mediaStorage.getMediaUrl(src);
      if (!cancelled) {
        setResolvedSrc(url);
      }
    };
    
    if (open && src) {
      resolveUrl();
    }
    
    return () => {
      cancelled = true;
    };
  }, [src, open]);

  // Reset zoom and resolved URL when modal closes
  React.useEffect(() => {
    if (!open) {
      setZoom(1);
      // Clean up blob URL if we created one
      if (resolvedSrc && resolvedSrc.startsWith('blob:') && src.startsWith('indexed-db://')) {
        URL.revokeObjectURL(resolvedSrc);
      }
      setResolvedSrc(null);
    }
  }, [open, resolvedSrc, src]);

  const displaySrc = resolvedSrc || src;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden">
        <DialogTitle className="sr-only">Vis media</DialogTitle>
        
        {/* Close button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
        >
          <X size={24} />
        </button>

        {/* Zoom controls for images */}
        {(type === 'image' || type === 'gif') && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className={cn(
                "p-2 text-white rounded-full transition-colors",
                zoom <= 0.5 ? "opacity-50 cursor-not-allowed" : "hover:bg-white/20"
              )}
            >
              <ZoomOut size={20} />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1 text-white text-sm font-medium hover:bg-white/20 rounded transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              className={cn(
                "p-2 text-white rounded-full transition-colors",
                zoom >= 3 ? "opacity-50 cursor-not-allowed" : "hover:bg-white/20"
              )}
            >
              <ZoomIn size={20} />
            </button>
          </div>
        )}

        {/* Media content */}
        <div className="flex items-center justify-center w-full h-full min-h-[50vh] overflow-auto">
          {!displaySrc ? (
            <div className="text-white/60">Laster...</div>
          ) : type === 'video' ? (
            <video
              src={displaySrc}
              controls
              autoPlay
              className="max-w-full max-h-[85vh] object-contain"
            >
              Din nettleser støtter ikke video.
            </video>
          ) : (
            <img
              src={displaySrc}
              alt={alt}
              className="object-contain transition-transform duration-200"
              style={{ 
                transform: `scale(${zoom})`,
                maxWidth: '100%',
                maxHeight: '85vh',
              }}
              onDoubleClick={handleReset}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
