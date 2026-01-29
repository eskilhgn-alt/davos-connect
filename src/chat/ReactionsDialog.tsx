/**
 * ReactionsDialog - Shows who reacted with what
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReactionsDialogProps {
  reactions: Record<string, string[]>;
  getUserName: (userId: string) => string;
  onClose: () => void;
}

export const ReactionsDialog: React.FC<ReactionsDialogProps> = ({
  reactions,
  getUserName,
  onClose,
}) => {
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className={cn(
          'w-[90%] max-w-sm bg-background rounded-2xl shadow-xl',
          'animate-in zoom-in-95 duration-150'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-medium text-foreground">Reaksjoner</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {entries.map(([emoji, users]) => (
            <div key={emoji} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{emoji}</span>
                <span className="text-sm text-muted-foreground">{users.length}</span>
              </div>
              <div className="space-y-1 pl-2">
                {users.map((userId) => (
                  <div key={userId} className="text-sm text-foreground">
                    {getUserName(userId)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
