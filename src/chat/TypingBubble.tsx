/**
 * TypingBubble - Shows animated typing indicator
 * Displayed when user is typing
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export const TypingBubble: React.FC = () => {
  return (
    <div className="flex items-start px-4 py-1">
      <div
        className={cn(
          'bg-muted rounded-2xl rounded-bl-md px-4 py-3',
          'flex items-center gap-1'
        )}
      >
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
};
