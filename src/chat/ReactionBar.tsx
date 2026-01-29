/**
 * ReactionBar - Quick reaction picker that appears on long-press
 * Shows common reactions + option to open full picker
 */

import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUICK_REACTIONS } from './emojiBank';

interface ReactionBarProps {
  onReact: (emoji: string) => void;
  onOpenPicker: () => void;
  onClose: () => void;
  position: 'top' | 'bottom';
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  onReact,
  onOpenPicker,
  onClose,
  position,
}) => {
  const handleReact = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2',
          'bg-background rounded-full shadow-lg border border-border',
          'flex items-center gap-1 px-2 py-1.5',
          'animate-in zoom-in-95 duration-150',
          position === 'top' ? 'top-20' : 'bottom-32'
        )}
      >
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleReact(emoji)}
            className={cn(
              'w-10 h-10 flex items-center justify-center',
              'text-2xl rounded-full hover:bg-muted active:scale-110',
              'transition-transform'
            )}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={onOpenPicker}
          className={cn(
            'w-10 h-10 flex items-center justify-center',
            'rounded-full bg-muted hover:bg-muted/80',
            'transition-colors'
          )}
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
};
