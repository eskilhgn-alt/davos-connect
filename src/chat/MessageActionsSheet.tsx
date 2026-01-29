/**
 * MessageActionsSheet - Bottom sheet for message actions
 * Edit, Delete, Copy, React
 */

import * as React from 'react';
import { Pencil, Trash2, Copy, SmilePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Action {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface MessageActionsSheetProps {
  isOwn: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onReact: () => void;
  onClose: () => void;
}

export const MessageActionsSheet: React.FC<MessageActionsSheetProps> = ({
  isOwn,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  onClose,
}) => {
  const actions: Action[] = [];

  // Reaction is available for all messages
  actions.push({
    icon: <SmilePlus size={20} />,
    label: 'Reager',
    onClick: onReact,
  });

  // Copy is available for all messages with text
  actions.push({
    icon: <Copy size={20} />,
    label: 'Kopier',
    onClick: onCopy,
  });

  // Edit and Delete only for own messages
  if (isOwn && onEdit) {
    actions.push({
      icon: <Pencil size={20} />,
      label: 'Rediger',
      onClick: onEdit,
    });
  }

  if (isOwn && onDelete) {
    actions.push({
      icon: <Trash2 size={20} />,
      label: 'Slett',
      onClick: onDelete,
      destructive: true,
    });
  }

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
        className={cn(
          'w-full max-w-lg bg-background rounded-t-2xl',
          'animate-in slide-in-from-bottom duration-200'
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-medium text-foreground">Handlinger</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X size={20} />
          </button>
        </div>

        {/* Actions */}
        <div className="py-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                // Just call the action - don't call onClose here
                // Each action handler should handle cleanup
                action.onClick();
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3',
                'text-left hover:bg-muted active:bg-muted/80 transition-colors',
                action.destructive && 'text-destructive'
              )}
            >
              {action.icon}
              <span className="text-base">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
