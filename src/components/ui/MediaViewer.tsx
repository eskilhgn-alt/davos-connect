/**
 * MediaViewer - Fullscreen media viewer with pinch-to-zoom
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
  const [scale, setScale] = React.useState(1);
  const [translate, setTranslate] = React.useState({ x: 0, y: 0 });
  const lastDistance = React.useRef(0);
  const lastCenter = React.useRef({ x: 0, y: 0 });
  const isDragging = React.useRef(false);
  const lastTouch = React.useRef({ x: 0, y: 0 });
  const lastTapTime = React.useRef(0);

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [open, src]);

  if (!open) return null;

  const getDistance = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDistance.current = getDistance(e.touches);
      lastCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      isDragging.current = true;
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches);
      const ratio = dist / lastDistance.current;
      const newScale = Math.min(Math.max(scale * ratio, 1), 5);
      setScale(newScale);
      lastDistance.current = dist;
      if (newScale <= 1) {
        setTranslate({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isDragging.current && scale > 1) {
      const dx = e.touches[0].clientX - lastTouch.current.x;
      const dy = e.touches[0].clientY - lastTouch.current.y;
      setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (scale <= 1.05) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  };

  const handleDoubleTap = () => {
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const handleTap = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      handleDoubleTap();
      e.stopPropagation();
    }
    lastTapTime.current = now;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={() => {
        if (scale <= 1) onClose();
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className={cn(
          'absolute z-10 p-2 rounded-full',
          'bg-black/50 text-white hover:bg-black/70 transition-colors'
        )}
        style={{ top: 'max(env(safe-area-inset-top, 0px), 16px)', right: '16px' }}
      >
        <X size={24} />
      </button>

      {/* Media content */}
      <div
        onClick={(e) => { e.stopPropagation(); handleTap(e); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="max-w-full max-h-full touch-none"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
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
            draggable={false}
          />
        )}
      </div>
    </div>
  );
};
