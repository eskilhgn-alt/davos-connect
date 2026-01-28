/**
 * MediaViewer - Fullscreen media viewer modal
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  type: 'image' | 'gif' | 'video';
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  open,
  onClose,
  src,
  type,
}) => {
  // Prevent scroll when open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "absolute top-4 right-4 z-10",
          "w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm",
          "flex items-center justify-center text-white",
          "hover:bg-white/20 transition-colors",
          "safe-area-top"
        )}
      >
        <X size={24} />
      </button>

      {/* Media content */}
      <div 
        className="max-w-full max-h-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85vh] rounded-lg"
          />
        ) : (
          <img
            src={src}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        )}
      </div>
    </div>
  );
};
