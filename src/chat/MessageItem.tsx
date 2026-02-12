/**
 * MessageItem - Single message bubble with reactions, edit, actions
 * Tap for actions, double-tap for seen-by (PWA-friendly, no long-press)
 */

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from './types';
import { ReactionsRow } from './ReactionsRow';
import { chatStore } from './store';
import { ChatPollCard } from '@/components/poll/ChatPollCard';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  currentUserId: string;
  onShowActions: (message: Message) => void;
  onShowReactions: (reactions: Record<string, string[]>) => void;
  onMediaTap?: (src: string, type: 'image' | 'video' | 'gif') => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  showSender,
  currentUserId,
  onShowActions,
  onShowReactions,
  onMediaTap,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(message.text);
  const editRef = React.useRef<HTMLTextAreaElement>(null);
  const lastTapRef = React.useRef(0);

  // Single tap → open combined actions sheet
  const handleBubbleTap = () => {
    if (message.deletedAt || isEditing) return;
    onShowActions(message);
  };

  // Format time
  const time = new Date(message.createdAt).toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Handle edit save
  const handleSaveEdit = () => {
    if (editText.trim()) {
      chatStore.editMessage(message.id, editText);
    }
    setIsEditing(false);
  };

  // Handle edit cancel
  const handleCancelEdit = () => {
    setEditText(message.text);
    setIsEditing(false);
  };

  // Focus textarea when editing starts
  React.useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing, editText.length]);

  // Start editing (called from parent via ref or callback)
  const startEditing = React.useCallback(() => {
    setEditText(message.text);
    setIsEditing(true);
  }, [message.text]);

  // Expose startEditing via window (scoped per message id, cleaned up on unmount)
  React.useEffect(() => {
    const key = `editMessage_${message.id}`;
    (window as unknown as Record<string, unknown>)[key] = startEditing;
    return () => {
      delete (window as unknown as Record<string, unknown>)[key];
    };
  }, [message.id, startEditing]);

  // Deleted message
  if (message.deletedAt) {
    return (
      <div
        className={cn(
          'flex flex-col gap-1 px-4 py-1',
          isOwn ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-4 py-2',
            'bg-muted/50 text-muted-foreground italic',
            isOwn ? 'rounded-br-md' : 'rounded-bl-md'
          )}
        >
          <p className="text-[15px] leading-snug">Melding slettet</p>
        </div>
        <span className="text-[11px] text-muted-foreground mx-3">
          {time}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-4 py-1',
        isOwn ? 'items-end' : 'items-start'
      )}
    >
      {/* Sender name - show for all messages */}
      {showSender && (
        <span className={cn(
          "text-xs font-medium ml-3",
          isOwn ? "text-muted-foreground/60" : "text-muted-foreground"
        )}>
          {message.senderName}
        </span>
      )}

      {/* Attachments */}
      {message.attachments && message.attachments.length > 0 && (
        <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
          {message.attachments.map((att) => (
            <div
              key={att.id}
              className="rounded-2xl overflow-hidden max-w-[260px] cursor-pointer active:opacity-80 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                if (onMediaTap && att.objectUrl) {
                  onMediaTap(att.objectUrl, att.kind === 'video' ? 'video' : att.kind === 'gif' ? 'gif' : 'image');
                }
              }}
            >
              {att.kind === 'video' ? (
                <video
                  src={att.objectUrl}
                  playsInline
                  muted
                  className="max-w-full h-auto"
                />
              ) : att.kind === 'gif' ? (
                <img
                  src={att.objectUrl}
                  alt="GIF"
                  className="max-w-full h-auto"
                />
              ) : (
                <img
                  src={(att as any).thumbUrl || att.objectUrl}
                  alt="Vedlegg"
                  className="max-w-full h-auto"
                  loading="lazy"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Text bubble or edit mode */}
      {message.text && (() => {
        // Check if this is a poll system message
        const pollAtt = message.attachments?.find((a: any) => a.kind === 'poll');
        if (pollAtt) {
          return (
            <div className={cn('px-1', isOwn ? 'flex justify-end' : '')}>
              <ChatPollCard
                pollId={(pollAtt as any).poll_id}
                pollEvent={(pollAtt as any).poll_event}
                messageText={message.text}
              />
            </div>
          );
        }

        return isEditing ? (
          <div className="max-w-[85%] flex flex-col gap-2">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className={cn(
                'w-full min-h-[80px] rounded-2xl px-4 py-2',
                'text-[16px] leading-snug bg-background border border-primary',
                'focus:outline-none focus:ring-2 focus:ring-primary'
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                }
                if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={16} />
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={handleBubbleTap}
            className={cn(
              'max-w-[75%] rounded-2xl px-4 py-2 cursor-pointer',
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted text-foreground rounded-bl-md'
            )}
            style={{ WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}
          >
            <p className="text-[15px] leading-snug whitespace-pre-wrap break-words select-text">
              {message.text}
            </p>
          </div>
        );
      })()}

      {/* Reactions */}
      {message.reactions && Object.keys(message.reactions).length > 0 && (
        <ReactionsRow
          reactions={message.reactions}
          currentUserId={currentUserId}
          isOwn={isOwn}
          onTap={() => onShowReactions(message.reactions!)}
        />
      )}

      {/* Timestamp + edited indicator */}
      <div className="flex items-center gap-2 mx-3">
        <span className="text-[11px] text-muted-foreground">
          {time}
        </span>
        {message.editedAt && (
          <span className="text-[11px] text-muted-foreground italic">
            (redigert)
          </span>
        )}
        {/* Tap on bubble to see who has read the message */}
      </div>
    </div>
  );
};
