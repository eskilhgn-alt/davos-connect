/**
 * MessageItem - Single message bubble
 * Minimal, no reactions/status for now - focus on stability
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Message } from './types';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isOwn,
  showSender,
}) => {
  // Format time
  const time = new Date(message.createdAt).toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-4 py-1',
        isOwn ? 'items-end' : 'items-start'
      )}
    >
      {/* Sender name for other users */}
      {showSender && !isOwn && (
        <span className="text-xs text-muted-foreground ml-3">
          {message.senderName}
        </span>
      )}

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
          {message.attachments.map((att) => (
            <div
              key={att.id}
              className="rounded-2xl overflow-hidden max-w-[260px]"
            >
              {att.kind === 'image' ? (
                <img
                  src={att.objectUrl}
                  alt="Vedlegg"
                  className="max-w-full h-auto"
                  loading="lazy"
                />
              ) : (
                <video
                  src={att.objectUrl}
                  controls
                  playsInline
                  className="max-w-full h-auto"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Text bubble */}
      {message.text && (
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-4 py-2',
            isOwn
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted text-foreground rounded-bl-md'
          )}
        >
          <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
            {message.text}
          </p>
        </div>
      )}

      {/* Timestamp */}
      <span className="text-[11px] text-muted-foreground mx-3">
        {time}
      </span>
    </div>
  );
};
