/**
 * ReactionsRow - Shows reactions under a message bubble
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ReactionsRowProps {
  reactions: Record<string, string[]>;
  currentUserId: string;
  onTap: () => void;
  isOwn: boolean;
}

export const ReactionsRow: React.FC<ReactionsRowProps> = ({
  reactions,
  currentUserId,
  onTap,
  isOwn,
}) => {
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  
  if (entries.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        'flex flex-wrap gap-1 mt-1',
        isOwn ? 'justify-end' : 'justify-start'
      )}
    >
      {entries.map(([emoji, users]) => {
        const hasReacted = users.includes(currentUserId);
        return (
          <span
            key={emoji}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm',
              'border transition-colors',
              hasReacted
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted border-border text-muted-foreground'
            )}
          >
            <span>{emoji}</span>
            <span className="text-xs">{users.length}</span>
          </span>
        );
      })}
    </button>
  );
};
