/**
 * MessageBubble - Single chat message
 * 
 * Features:
 * - Own vs others styling
 * - Status indicators (sent/delivered/seen)
 * - Reactions display
 * - Attachment previews
 * - Long-press for actions
 */

import * as React from 'react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { Check, CheckCheck, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalMessage, MessageStatus } from '@/services/contracts';
import { mediaStorage } from '@/services/media-storage';

interface MessageBubbleProps {
  message: LocalMessage;
  isOwn: boolean;
  showSender: boolean;
  currentUserId: string;
  onLongPress: (message: LocalMessage) => void;
  onMediaClick: (src: string, type: 'image' | 'gif' | 'video') => void;
  onReactionTap: (emoji: string) => void;
}

const StatusIcon: React.FC<{ status?: MessageStatus }> = ({ status }) => {
  switch (status) {
    case 'seen':
      return <Eye size={14} className="text-primary" />;
    case 'delivered':
      return <CheckCheck size={14} className="text-muted-foreground" />;
    default:
      return <Check size={14} className="text-muted-foreground" />;
  }
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showSender,
  currentUserId,
  onLongPress,
  onMediaClick,
  onReactionTap,
}) => {
  const [mediaUrls, setMediaUrls] = React.useState<Record<string, string>>({});
  const [showTime, setShowTime] = React.useState(false);
  const longPressTimer = React.useRef<number | null>(null);
  const blobUrlsRef = React.useRef<Set<string>>(new Set());

  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt;
  const hasReactions = Object.keys(message.reactions).length > 0;
  const hasAttachments = message.attachments.length > 0;

  // Load media URLs
  React.useEffect(() => {
    let mounted = true;
    
    const loadUrls = async () => {
      const urls: Record<string, string> = {};
      for (const att of message.attachments) {
        const urlToResolve = att.thumbUrl || att.url;
        const url = await mediaStorage.getMediaUrl(urlToResolve);
        if (url && mounted) {
          urls[att.id] = url;
          if (url.startsWith('blob:')) {
            blobUrlsRef.current.add(url);
          }
        }
      }
      if (mounted) setMediaUrls(urls);
    };

    if (hasAttachments) loadUrls();

    return () => { mounted = false; };
  }, [message.attachments, hasAttachments]);

  // Cleanup blob URLs
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleTouchStart = () => {
    longPressTimer.current = window.setTimeout(() => {
      if (!isDeleted) onLongPress(message);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTap = () => {
    setShowTime(prev => !prev);
  };

  const handleMediaClick = async (att: { id: string; type: 'image' | 'gif' | 'video'; url: string }) => {
    const url = await mediaStorage.getMediaUrl(att.url);
    if (url) {
      if (url.startsWith('blob:')) blobUrlsRef.current.add(url);
      onMediaClick(url, att.type);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-4 py-0.5",
        isOwn ? "items-end" : "items-start"
      )}
    >
      {/* Sender name */}
      {showSender && !isOwn && !isDeleted && (
        <span className="text-xs font-medium text-muted-foreground ml-3">
          {message.senderName}
        </span>
      )}

      {/* Message bubble */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleTap}
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 select-none",
          isDeleted
            ? "bg-muted/50 italic text-muted-foreground"
            : isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        {isDeleted ? (
          <p className="text-sm">Melding slettet</p>
        ) : (
          <>
            {/* Attachments */}
            {hasAttachments && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.map((att) => {
                  const url = mediaUrls[att.id];
                  if (!url) return null;
                  
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMediaClick(att);
                      }}
                      className="relative overflow-hidden rounded-lg max-w-[200px]"
                    >
                      <img
                        src={url}
                        alt=""
                        className="max-w-full h-auto rounded-lg"
                        loading="lazy"
                      />
                      {att.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                            <div className="w-0 h-0 border-t-6 border-t-transparent border-l-10 border-l-foreground border-b-6 border-b-transparent ml-1" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Text */}
            {message.text && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.text}
              </p>
            )}
          </>
        )}
      </div>

      {/* Timestamp */}
      {showTime && !isDeleted && (
        <div className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          isOwn ? "mr-3" : "ml-3"
        )}>
          <span>{format(new Date(message.createdAt), 'HH:mm', { locale: nb })}</span>
          {isEdited && <span>· Redigert</span>}
          {isOwn && <StatusIcon status={message.status} />}
        </div>
      )}

      {/* Reactions */}
      {hasReactions && !isDeleted && (
        <div className={cn("flex flex-wrap gap-1 mt-1", isOwn ? "mr-3" : "ml-3")}>
          {Object.entries(message.reactions).map(([emoji, userIds]) => {
            const hasReacted = userIds.includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReactionTap(emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors",
                  hasReacted ? "bg-primary/20 text-primary" : "bg-muted hover:bg-muted/80"
                )}
              >
                <span>{emoji}</span>
                {userIds.length > 1 && (
                  <span className="text-xs font-medium">{userIds.length}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
