import * as React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Copy, Pencil, Trash2, SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageActionsMenuProps {
  isOwnMessage: boolean;
  isDeleted: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onReact: () => void;
  children: React.ReactNode;
}

export const MessageActionsMenu: React.FC<MessageActionsMenuProps> = ({
  isOwnMessage,
  isDeleted,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  children,
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {!isDeleted && (
          <>
            <ContextMenuItem onClick={onReact} className="gap-2">
              <SmilePlus size={16} />
              Reager
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        
        {isOwnMessage && !isDeleted && onEdit && (
          <ContextMenuItem onClick={onEdit} className="gap-2">
            <Pencil size={16} />
            Rediger
          </ContextMenuItem>
        )}
        
        {!isDeleted && (
          <ContextMenuItem onClick={onCopy} className="gap-2">
            <Copy size={16} />
            Kopier
          </ContextMenuItem>
        )}
        
        {isOwnMessage && !isDeleted && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={onDelete} 
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 size={16} />
              Slett
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
