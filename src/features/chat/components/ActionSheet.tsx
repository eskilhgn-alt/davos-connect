/**
 * ActionSheet - Simple bottom sheet for message actions
 * Used for reactions, edit, delete, copy
 */

import * as React from 'react';
import { X, Copy, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalMessage } from '@/services/contracts';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  message: LocalMessage | null;
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

export const ActionSheet: React.FC<ActionSheetProps> = ({
  open,
  onClose,
  message,
  isOwn,
  onReact,
  onEdit,
  onDelete,
  onCopy,
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

  if (!open || !message) return null;

  const handleReact = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0",
          "bg-background rounded-t-2xl",
          "animate-in slide-in-from-bottom duration-200",
          "safe-area-bottom"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Reaction row */}
        <div className="flex justify-center gap-4 py-4 px-4 border-b border-border">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              className="text-3xl tap-target flex items-center justify-center hover:scale-110 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="py-2">
          <button
            type="button"
            onClick={() => { onCopy(); onClose(); }}
            className="w-full flex items-center gap-4 px-6 py-4 hover:bg-muted transition-colors"
          >
            <Copy size={20} className="text-muted-foreground" />
            <span>Kopier tekst</span>
          </button>

          {isOwn && (
            <>
              <button
                type="button"
                onClick={() => { onEdit(); onClose(); }}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-muted transition-colors"
              >
                <Pencil size={20} className="text-muted-foreground" />
                <span>Rediger</span>
              </button>

              <button
                type="button"
                onClick={() => { onDelete(); onClose(); }}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-muted transition-colors text-destructive"
              >
                <Trash2 size={20} />
                <span>Slett</span>
              </button>
            </>
          )}
        </div>

        {/* Cancel */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "w-full py-3 rounded-xl",
              "bg-muted text-foreground font-medium",
              "hover:bg-muted/80 transition-colors"
            )}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
};
