import * as React from 'react';
import { cn } from '@/lib/utils';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'] as const;

interface ReactionBarProps {
  onReact: (emoji: string) => void;
  onMoreReactions?: () => void;
  className?: string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  onReact,
  onMoreReactions,
  className,
}) => {
  return (
    <div 
      className={cn(
        "flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-150",
        className
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className="tap-target w-9 h-9 flex items-center justify-center text-lg hover:bg-muted rounded-full transition-colors"
        >
          {emoji}
        </button>
      ))}
      {onMoreReactions && (
        <button
          type="button"
          onClick={onMoreReactions}
          className="tap-target w-9 h-9 flex items-center justify-center text-muted-foreground hover:bg-muted rounded-full transition-colors"
        >
          +
        </button>
      )}
    </div>
  );
};
