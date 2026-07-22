/**
 * MessageItem - Single message bubble with reply, delivery state, reactions.
 */

import * as React from 'react';
import { Check, X, AlertCircle, RotateCw, FileText, Download, Play, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message, Attachment } from './types';
import { ReactionsRow } from './ReactionsRow';
import { chatStore } from './store';
import { ChatPollCard } from '@/components/poll/ChatPollCard';
import { useSignedMedia } from '@/components/ui/SignedMedia';
import { errorToast } from '@/utils/errorToast';

/**
 * Media attachment renderer with private-URL resolution and robust video fallback.
 * - Images: prefers thumbnail path/url and falls back to full-size.
 * - Videos: shows the thumbnail poster with a play overlay; if a thumbnail is
 *   unavailable (extraction failed at upload time or on a legacy attachment),
 *   we render a real <video preload="metadata"> so the browser draws its own
 *   first-frame poster, with the same play-overlay button on top.
 */
export const MediaAttachment: React.FC<{ att: Attachment; onTap: (src: string) => void }> = ({ att, onTap }) => {
  const bucket = att.storageBucket ?? null;
  const full = useSignedMedia(bucket, att.storagePath ?? null, att.objectUrl || null);
  const thumb = useSignedMedia(bucket, att.thumbnailPath ?? null, att.thumbUrl ?? null);

  // Full-media one-shot retry gate. Terminal error only surfaces after the
  // signed URL is re-fetched once and still fails to load.
  const [fullLoadFailed, setFullLoadFailed] = React.useState(false);
  const fullRetriedRef = React.useRef(false);
  // Thumbnail is an optimization: if it fails, we silently fall back to the
  // full-size media instead of blocking the whole attachment.
  const [thumbLoadFailed, setThumbLoadFailed] = React.useState(false);
  const thumbRetriedRef = React.useRef(false);

  // Reset gates only when the attachment identity inputs change — never when
  // internal re-signs produce fresh URLs for the same attachment.
  React.useEffect(() => {
    setFullLoadFailed(false);
    setThumbLoadFailed(false);
    fullRetriedRef.current = false;
    thumbRetriedRef.current = false;
  }, [
    att.storageBucket,
    att.storagePath,
    att.thumbnailPath,
    att.objectUrl,
    att.thumbUrl,
  ]);

  const fullUrl = full.url;
  const thumbUsable = !thumbLoadFailed && thumb.status !== 'error';
  const thumbUrl = thumbUsable ? thumb.url : undefined;

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

  const handleFullError = () => {
    if (!fullRetriedRef.current) {
      fullRetriedRef.current = true;
      full.retry();
    } else {
      setFullLoadFailed(true);
    }
  };
  const handleThumbError = () => {
    if (!thumbRetriedRef.current) {
      thumbRetriedRef.current = true;
      thumb.retry();
    } else {
      setThumbLoadFailed(true);
    }
  };

  const label = att.kind === 'video' ? 'Spill av video' : att.kind === 'gif' ? 'Vis GIF' : 'Vis bilde';
  const disabled = !fullUrl;
  // Terminal error only when the FULL media cannot be resolved or displayed.
  // Thumbnail failures degrade gracefully to the full URL.
  const hasError = full.status === 'error' || fullLoadFailed;

  if (hasError) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="flex items-center gap-2 rounded-2xl px-3 py-2 border border-border bg-muted/50 max-w-[260px]"
      >
        <AlertCircle size={14} className="text-destructive flex-none" aria-hidden="true" />
        <span className="text-xs text-muted-foreground flex-1">Kunne ikke laste vedlegg</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFullLoadFailed(false);
            setThumbLoadFailed(false);
            fullRetriedRef.current = false;
            thumbRetriedRef.current = false;
            full.retry();
            thumb.retry();
          }}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
          aria-label="Prøv å laste vedlegget på nytt"
        >
          <RotateCw size={12} aria-hidden="true" />
          <span>Prøv igjen</span>
        </button>
      </div>
    );
  }

  if (att.kind === 'image' || att.kind === 'gif') {
    // Thumb is preferred; if it errors, we render the full URL directly and
    // apply the full-media error gate to any subsequent decode failures.
    const usingThumb = Boolean(thumbUrl);
    const src = thumbUrl || fullUrl;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-busy={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="rounded-2xl overflow-hidden max-w-[260px] cursor-pointer active:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {src ? (
          <img
            src={src}
            alt={att.kind === 'gif' ? 'GIF' : 'Vedlegg'}
            className="max-w-full h-auto"
            loading="lazy"
            decoding="async"
            onError={usingThumb ? handleThumbError : handleFullError}
          />
        ) : (
          <div className="w-[220px] h-[160px] bg-muted animate-pulse" aria-hidden />
        )}
      </div>
    );
  }

  // Video
  const usingThumbPoster = Boolean(thumbUrl);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-busy={disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="relative rounded-2xl overflow-hidden max-w-[260px] cursor-pointer active:opacity-80 transition-opacity bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {usingThumbPoster ? (
        <img
          src={thumbUrl}
          alt="Videoforhåndsvisning"
          className="max-w-full h-auto block"
          loading="lazy"
          decoding="async"
          onError={handleThumbError}
        />
      ) : fullUrl ? (
        <video
          src={fullUrl}
          preload="metadata"
          playsInline
          muted
          className="max-w-full h-auto block pointer-events-none"
          onError={handleFullError}
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
 * File/PDF attachment renderer with signed-URL status, error, and retry UI.
 */
const FileAttachmentItem: React.FC<{ att: Attachment; isOwn: boolean }> = ({ att, isOwn }) => {
  const bucket = att.storageBucket ?? null;
  const { url: resolved, status, error, retry } = useSignedMedia(bucket, att.storagePath ?? null, att.objectUrl || null);

  if (status === 'error') {
    return (
      <div
        role="alert"
        aria-live="polite"
        className={cn(
          'flex items-center gap-2 rounded-2xl px-3 py-2 border',
          isOwn ? 'bg-primary/10 border-primary/40' : 'bg-muted border-border',
        )}
      >
        <AlertCircle size={16} className="text-destructive flex-none" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs truncate">Kunne ikke laste {att.filename || 'fil'}</p>
          {error && <p className="text-[11px] text-muted-foreground truncate">{error}</p>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); retry(); }}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground flex-none"
          aria-label="Prøv å laste filen på nytt"
        >
          <RotateCw size={12} aria-hidden="true" />
          <span>Prøv igjen</span>
        </button>
      </div>
    );
  }

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
      aria-busy={disabled || undefined}
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
  onReply: (message: Message) => void;
  onQuickReact: (message: Message) => void;
  onShowReactions: (reactions: Record<string, string[]>) => void;
  onMediaTap?: (src: string, type: 'image' | 'video' | 'gif') => void;
  editRequested?: boolean;
  onEditRequestHandled?: () => void;
  seenCount?: number;
}

const MessageItemComponent: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  showSender,
  currentUserId,
  onShowActions,
  onReply,
  onQuickReact,
  onShowReactions,
  onMediaTap,
  editRequested = false,
  onEditRequestHandled,
  seenCount = 0,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState(message.text);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const editRef = React.useRef<HTMLTextAreaElement>(null);
  const gestureRef = React.useRef<{ pointerId: number; x: number; y: number; cancelled: boolean } | null>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Format time
  const time = new Date(message.createdAt).toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Handle edit save
  const handleSaveEdit = async () => {
    const next = editText.trim();
    if (!next || savingEdit) return;
    setSavingEdit(true);
    try {
      await chatStore.editMessage(message.id, next);
      setIsEditing(false);
    } catch (error) {
      errorToast('Kunne ikke redigere meldingen', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSavingEdit(false);
    }
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

  React.useEffect(() => {
    if (!editRequested) return;
    startEditing();
    onEditRequestHandled?.();
  }, [editRequested, onEditRequestHandled, startEditing]);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isEditing || message.deletedAt) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cancelled: false,
    };
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.cancelled) return;
      gesture.cancelled = true;
      setSwipeOffset(0);
      navigator.vibrate?.(8);
      onShowActions(message);
    }, 420);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      gesture.cancelled = true;
      clearLongPress();
      setSwipeOffset(0);
      return;
    }
    if (dx > 4 && Math.abs(dx) > Math.abs(dy)) {
      clearLongPress();
      setSwipeOffset(Math.min(72, dx * 0.72));
    }
  };

  const finishGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    clearLongPress();
    gestureRef.current = null;
    if (gesture && !gesture.cancelled && event.clientX - gesture.x >= 58) {
      navigator.vibrate?.(6);
      onReply(message);
    }
    setSwipeOffset(0);
  };

  // Deleted message
  if (message.deletedAt) {
    return (
      <div
        id={`msg-${message.id}`}
        data-chat-message-id={message.id}
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
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-primary/10 p-2 text-primary"
        style={{ opacity: Math.min(1, swipeOffset / 46), transform: `translateY(-50%) scale(${0.8 + Math.min(0.2, swipeOffset / 250)})` }}
      >
        <Reply size={18} />
      </div>
      <div
        id={`msg-${message.id}`}
        data-chat-message-id={message.id}
        className={cn(
          'flex flex-col gap-1 px-4 py-1 transition-transform duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          isOwn ? 'items-end' : 'items-start'
        )}
        style={{ transform: `translateX(${swipeOffset}px)`, touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
        tabIndex={0}
        aria-label={`Melding fra ${message.senderName}. Hold inne for valg, sveip mot høyre for å svare.`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={() => { clearLongPress(); gestureRef.current = null; setSwipeOffset(0); }}
        onContextMenu={(event) => { event.preventDefault(); onShowActions(message); }}
        onDoubleClick={() => onQuickReact(message)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            onShowActions(message);
          }
        }}
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
            <FileAttachmentItem key={att.id} att={att} isOwn={isOwn} />
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
                disabled={savingEdit}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Lagre redigering"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editText.trim()}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              >
                <Check size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'max-w-[75%] rounded-2xl px-4 py-2',
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-muted text-foreground rounded-bl-md'
            )}
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
        {isOwn && seenCount > 0 && message.deliveryState === 'sent' && (
          <span className="text-[11px] font-medium text-primary" aria-label={`Sett av ${seenCount}`}>
            Sett{seenCount > 1 ? ` av ${seenCount}` : ''}
          </span>
        )}
      </div>
      </div>
    </div>
  );
};

export const MessageItem = React.memo(MessageItemComponent, (previous, next) => (
  previous.message === next.message
  && previous.isOwn === next.isOwn
  && previous.showSender === next.showSender
  && previous.currentUserId === next.currentUserId
  && previous.editRequested === next.editRequested
  && previous.seenCount === next.seenCount
));
