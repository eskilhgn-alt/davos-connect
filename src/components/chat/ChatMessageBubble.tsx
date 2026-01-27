import * as React from 'react';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale';
import { Check, CheckCheck, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalMessage, MessageStatus } from '@/services/contracts';
import { useLongPress } from '@/hooks/useLongPress';
import { ReactionBar } from './ReactionBar';
import { MessageActionsMenu } from './MessageActionsMenu';
import { MediaViewerModal } from './MediaViewerModal';
import { mediaStorage } from '@/services/media-storage';

interface ChatMessageBubbleProps {
  message: LocalMessage;
  isOwnMessage: boolean;
  showTimestamp: boolean;
  showSenderName: boolean;
  onToggleTimestamp: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  currentUserId: string;
}

const StatusIcon: React.FC<{ status?: MessageStatus }> = ({ status }) => {
  switch (status) {
    case 'seen':
      return <Eye size={14} className="text-primary" />;
    case 'delivered':
      return <CheckCheck size={14} className="text-muted-foreground" />;
    case 'sent':
    default:
      return <Check size={14} className="text-muted-foreground" />;
  }
};

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  isOwnMessage,
  showTimestamp,
  showSenderName,
  onToggleTimestamp,
  onEdit,
  onDelete,
  onReact,
  onCopy,
  currentUserId,
}) => {
  const [showReactionBar, setShowReactionBar] = React.useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = React.useState(false);
  const [selectedMedia, setSelectedMedia] = React.useState<{ src: string; type: 'image' | 'gif' | 'video' } | null>(null);
  const [mediaUrls, setMediaUrls] = React.useState<Record<string, string>>({});

  const isDeleted = !!message.deletedAt;
  const isEdited = !!message.editedAt;
  const hasReactions = Object.keys(message.reactions).length > 0;
  const hasAttachments = message.attachments.length > 0;

  // Load media URLs from IndexedDB if needed
  React.useEffect(() => {
    const loadMediaUrls = async () => {
      const urls: Record<string, string> = {};
      for (const attachment of message.attachments) {
        const url = await mediaStorage.getMediaUrl(attachment.url);
        if (url) {
          urls[attachment.id] = url;
        }
      }
      setMediaUrls(urls);
    };
    if (hasAttachments) {
      loadMediaUrls();
    }
  }, [message.attachments, hasAttachments]);

  const longPressHandlers = useLongPress({
    onLongPress: () => {
      if (!isDeleted) {
        setShowReactionBar(true);
      }
    },
    onClick: onToggleTimestamp,
  });

  const handleReact = (emoji: string) => {
    onReact(emoji);
    setShowReactionBar(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    onCopy();
  };

  const openMediaViewer = (attachment: { id: string; type: 'image' | 'gif' | 'video'; url: string }) => {
    const url = mediaUrls[attachment.id] || attachment.url;
    setSelectedMedia({ src: url, type: attachment.type });
    setMediaViewerOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-1 px-4 py-0.5",
          isOwnMessage ? "items-end" : "items-start"
        )}
      >
        {/* Sender name (only for others' messages in group) */}
        {showSenderName && !isOwnMessage && !isDeleted && (
          <span className="text-xs font-medium text-muted-foreground ml-3">
            {message.senderName}
          </span>
        )}

        {/* Reaction bar (shown on long press) */}
        {showReactionBar && (
          <div className="mb-2">
            <ReactionBar
              onReact={handleReact}
              onMoreReactions={() => setShowReactionBar(false)}
            />
          </div>
        )}

        {/* Message bubble with context menu */}
        <MessageActionsMenu
          isOwnMessage={isOwnMessage}
          isDeleted={isDeleted}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopy={handleCopy}
          onReact={() => setShowReactionBar(true)}
        >
          <div
            {...longPressHandlers}
            className={cn(
              "max-w-[75%] rounded-2xl px-4 py-2 cursor-pointer select-none",
              isDeleted
                ? "bg-muted/50 italic text-muted-foreground"
                : isOwnMessage
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
                    {message.attachments.map((attachment) => {
                      const url = mediaUrls[attachment.id] || attachment.url;
                      return (
                        <button
                          key={attachment.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openMediaViewer(attachment);
                          }}
                          className="relative overflow-hidden rounded-lg max-w-[200px] hover:opacity-90 transition-opacity"
                        >
                          {attachment.type === 'video' ? (
                            <video
                              src={url}
                              className="max-w-full h-auto rounded-lg"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={url}
                              alt="Vedlegg"
                              className="max-w-full h-auto rounded-lg"
                              loading="lazy"
                            />
                          )}
                          {attachment.type === 'video' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-foreground border-b-8 border-b-transparent ml-1" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Message text */}
                {message.text && (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                )}
              </>
            )}
          </div>
        </MessageActionsMenu>

        {/* Timestamp and status */}
        {showTimestamp && !isDeleted && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            isOwnMessage ? "mr-3" : "ml-3"
          )}>
            <span>
              {format(new Date(message.createdAt), 'HH:mm', { locale: nb })}
            </span>
            {isEdited && <span>· Redigert</span>}
            {isOwnMessage && <StatusIcon status={message.status} />}
          </div>
        )}

        {/* Reactions */}
        {hasReactions && !isDeleted && (
          <div className={cn(
            "flex flex-wrap gap-1 mt-1",
            isOwnMessage ? "mr-3" : "ml-3"
          )}>
            {Object.entries(message.reactions).map(([emoji, userIds]) => {
              const hasReacted = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors",
                    hasReacted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted hover:bg-muted/80"
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

      {/* Media viewer modal */}
      {selectedMedia && (
        <MediaViewerModal
          open={mediaViewerOpen}
          onOpenChange={setMediaViewerOpen}
          src={selectedMedia.src}
          type={selectedMedia.type}
        />
      )}
    </>
  );
};
