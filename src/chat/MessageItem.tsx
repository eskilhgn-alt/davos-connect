/**
 * MessageItem - Single message bubble with reply, delivery state, reactions.
 */

import * as React from 'react';
import { Check, X, AlertCircle, RotateCw, FileText, Download, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message, Attachment } from './types';
import { ReactionsRow } from './ReactionsRow';
import { chatStore } from './store';
import { ChatPollCard } from '@/components/poll/ChatPollCard';
import { useSignedUrl } from '@/components/ui/SignedMedia';

/**
 * Media attachment renderer with private-URL resolution and robust video fallback.
 * - Images: prefers thumbnail path/url and falls back to full-size.
 * - Videos: shows the thumbnail poster with a play overlay; if a thumbnail is
 *   unavailable (extraction failed at upload time or on a legacy attachment),
 *   we render a real <video preload="metadata"> so the browser draws its own
 *   first-frame poster, with the same play-overlay button on top.
 */
const MediaAttachment: React.FC<{ att: Attachment; onTap: (src: string) => void }> = ({ att, onTap }) => {
  const bucket = att.storageBucket ?? null;
  const fullUrl = useSignedUrl(bucket, att.storagePath ?? null, att.objectUrl || null);
  const thumbUrl = useSignedUrl(bucket, att.thumbnailPath ?? null, att.thumbUrl ?? null);

  const activate = React.useCallback(() => {
    if (fullUrl) onTap(fullUrl);
  }, [fullUrl, onTap]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    activate();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      activate();
    }
  };

  const label = att.kind === 'video' ? 'Spill av video' : att.kind === 'gif' ? 'Vis GIF' : 'Vis bilde';
  const disabled = !fullUrl;

  if (att.kind === 'image' || att.kind === 'gif') {
    const src = thumbUrl || fullUrl;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="rounded-2xl overflow-hidden max-w-[260px] cursor-pointer active:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {src ? (
          <img src={src} alt={att.kind === 'gif' ? 'GIF' : 'Vedlegg'} className="max-w-full h-auto" loading="lazy" decoding="async" />
        ) : (
          <div className="w-[220px] h-[160px] bg-muted animate-pulse" aria-hidden />
        )}
      </div>
    );
  }

  // Video
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="relative rounded-2xl overflow-hidden max-w-[260px] cursor-pointer active:opacity-80 transition-opacity bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt="Videoforhåndsvisning" className="max-w-full h-auto block" loading="lazy" decoding="async" />
      ) : fullUrl ? (
        <video
          src={fullUrl}
          preload="metadata"
          playsInline
          muted
          className="max-w-full h-auto block pointer-events-none"
        />
      ) : (
        <div className="w-[220px] h-[160px]" aria-hidden />
      )}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-12 h-12 rounded-full bg-black/55 text-white flex items-center justify-center">
          <Play size={22} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

/**
 * File/PDF attachment renderer. Routes through the signed resolver using
 * stable (bucket, path) when present, falling back to legacy public URL or
 * external URL passthrough. Shows a loading state until the URL is resolved
 * and disables the link (prevents empty-href navigation) when resolution
 * hasn't completed or has failed. Full status UI (retry, error banner) lives
 * in Slice 2; here we only guarantee that the private-media switch does not
 * break downloads.
 */
const FileAttachmentItem: React.FC<{ att: Attachment; isOwn: boolean }> = ({ att, isOwn }) => {
  const bucket = att.storageBucket ?? null;
  const resolved = useSignedUrl(bucket, att.storagePath ?? null, att.objectUrl || null);
  const href = resolved || '';
  const disabled = !href;
  return (
    <a
      href={href || undefined}
      target={disabled ? undefined : '_blank'}
      rel="noopener noreferrer"
      download={att.filename || ''}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) e.preventDefault();
      }}
      aria-disabled={disabled || undefined}
      aria-label={disabled ? `Laster ${att.filename || 'fil'}…` : `Last ned ${att.filename || 'fil'}`}
      className={cn(
        'flex items-center gap-2 rounded-2xl px-3 py-2 border',
        isOwn ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-muted border-border',
        disabled && 'opacity-70 cursor-progress',
      )}
    >
      <FileText size={20} className="flex-none" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm truncate">{att.filename || 'Fil'}</p>
        {att.size !== undefined && (
          <p className="text-[11px] opacity-75">{Math.ceil((att.size || 0) / 1024)} kB</p>
        )}
      </div>
      <Download size={14} className="flex-none opacity-70" aria-hidden="true" />
    </a>
  );
};

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
        id={`msg-${message.id}`}
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
      id={`msg-${message.id}`}
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

      {/* Reply quote */}
      {message.replyTo && (
        <div
          className={cn(
            'max-w-[75%] rounded-lg px-3 py-1.5 mb-0.5 border-l-2',
            isOwn ? 'bg-primary/10 border-primary/60' : 'bg-muted/50 border-muted-foreground/40'
          )}
        >
          <p className="text-[11px] font-medium text-muted-foreground truncate">
            {message.replyTo.senderName || 'Ukjent'}
          </p>
          <p className="text-[12px] text-muted-foreground truncate italic">
            {message.replyTo.deleted ? 'Slettet melding' : (message.replyTo.text || 'Vedlegg')}
          </p>
        </div>
      )}

      {/* File attachments (non-media) */}
      {message.attachments?.some((a) => a.kind === 'file') && (
        <div className={cn('flex flex-col gap-1 max-w-[75%]', isOwn ? 'items-end' : 'items-start')}>
          {message.attachments.filter((a) => a.kind === 'file').map((att) => (
            <a
              key={att.id}
              href={att.objectUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={att.filename || ''}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex items-center gap-2 rounded-2xl px-3 py-2 border',
                isOwn ? 'bg-primary text-primary-foreground border-primary/40' : 'bg-muted border-border'
              )}
              aria-label={`Last ned ${att.filename || 'fil'}`}
            >
              <FileText size={20} className="flex-none" />
              <div className="min-w-0">
                <p className="text-sm truncate">{att.filename || 'Fil'}</p>
                {att.size !== undefined && (
                  <p className="text-[11px] opacity-75">{Math.ceil((att.size || 0) / 1024)} kB</p>
                )}
              </div>
              <Download size={14} className="flex-none opacity-70" />
            </a>
          ))}
        </div>
      )}


      {/* Media attachments only — file attachments render above */}
      {message.attachments && message.attachments.some((a) => a.kind === 'image' || a.kind === 'video' || a.kind === 'gif') && (
        <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
          {message.attachments
            .filter((a) => a.kind === 'image' || a.kind === 'video' || a.kind === 'gif')
            .map((att) => (
              <MediaAttachment
                key={att.id}
                att={att}
                onTap={(src) => onMediaTap?.(src, att.kind === 'video' ? 'video' : att.kind === 'gif' ? 'gif' : 'image')}
              />
            ))}
        </div>
      )}

      {/* Text bubble or edit mode */}
      {message.text && (() => {
        // Check if this is a poll system message
        const pollAtt = message.attachments?.find((a: { kind: string }) => a.kind === 'poll');
        if (pollAtt) {
          return (
            <div className={cn('px-1', isOwn ? 'flex justify-end' : '')}>
              <ChatPollCard
                pollId={(pollAtt as { poll_id?: string }).poll_id}
                pollEvent={(pollAtt as { poll_event?: 'created' | 'cancelled' | 'ended' | 'reminder' }).poll_event}
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
                aria-label="Avbryt redigering"
                onClick={handleCancelEdit}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Lagre redigering"
                onClick={handleSaveEdit}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Check size={16} aria-hidden="true" />
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

      {/* Timestamp + edited indicator + delivery state */}
      <div className="flex items-center gap-2 mx-3">
        <span className="text-[11px] text-muted-foreground">
          {time}
        </span>
        {message.editedAt && (
          <span className="text-[11px] text-muted-foreground italic">
            (redigert)
          </span>
        )}
        {isOwn && message.deliveryState === 'sending' && (
          <span className="text-[11px] text-muted-foreground italic" aria-live="polite">Sender…</span>
        )}
        {isOwn && message.deliveryState === 'failed' && message.clientId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); chatStore.retrySend(message.clientId!); }}
            className="flex items-center gap-1 text-[11px] text-destructive"
            aria-label="Prøv å sende meldingen på nytt"
          >
            <AlertCircle size={12} />
            <RotateCw size={12} />
            <span>Prøv igjen</span>
          </button>
        )}
      </div>
    </div>
  );
};
