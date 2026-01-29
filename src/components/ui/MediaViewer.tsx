/**
 * Simple MediaViewer for Gallery
 * Just displays images/videos fullscreen
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  type: 'image' | 'video' | 'gif';
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  open,
  onClose,
  src,
  type,
}) => {
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className={cn(
          'absolute top-4 right-4 z-10 p-2 rounded-full',
          'bg-black/50 text-white',
          'safe-area-top'
        )}
      >
        <X size={24} />
      </button>

      {/* Media content */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full">
        {type === 'video' ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-screen"
          />
        ) : (
          <img
            src={src}
            alt="Media"
            className="max-w-full max-h-screen object-contain"
          />
        )}
      </div>
    </div>
  );
};
