/**
 * EmojiPicker - Simple bottom sheet emoji picker
 * No external dependencies, fixed position inside ChatScreen
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMOJI_CATEGORIES } from './emojiBank';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = React.useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Prevent scroll propagation
  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={handleBackdropClick}
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div
        ref={contentRef}
        onTouchMove={handleTouchMove}
        className={cn(
          'w-full max-w-lg bg-background rounded-t-2xl',
          'flex flex-col max-h-[50vh]',
          'animate-in slide-in-from-bottom duration-200'
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-medium text-foreground">Velg emoji</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X size={20} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-2 py-2 overflow-x-auto border-b border-border">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setActiveCategory(idx)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors',
                activeCategory === idx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onSelect(emoji)}
                className={cn(
                  'w-10 h-10 flex items-center justify-center',
                  'text-2xl rounded-lg hover:bg-muted active:bg-muted/80',
                  'transition-colors'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
