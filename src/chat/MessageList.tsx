/**
 * MessageList - Scrollable message container
 * Native scrolling, auto-scroll, "jump to bottom" button
 */

import * as React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from './types';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  composerHeight: number;
}

function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return 'I dag';
  if (isYesterday(date)) return 'I går';
  return format(date, 'd. MMMM', { locale: nb });
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const dateStr = format(new Date(msg.createdAt), 'yyyy-MM-dd');
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groups.push({ date: dateStr, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  composerHeight,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = React.useState(false);
  const isNearBottomRef = React.useRef(true);

  // Check if near bottom
  const checkNearBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 150;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
    return nearBottom;
  }, []);

  // Scroll to bottom
  const scrollToBottom = React.useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Initial scroll
  React.useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Auto-scroll on new messages if near bottom
  React.useEffect(() => {
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [messages.length, scrollToBottom]);

  const groups = groupMessagesByDate(messages);

  // Calculate padding: composer height + safe area + keyboard
  // The keyboard is handled by the shell, but we need space for composer
  const paddingBottom = composerHeight + 16; // 16px extra breathing room

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className="h-full overflow-y-auto overscroll-contain"
        style={{
          paddingBottom,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="py-4">
          {groups.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <p>Ingen meldinger ennå</p>
              <p className="text-sm mt-1">Send den første!</p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex justify-center py-3">
                <span className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                  {formatDateSeparator(group.messages[0].createdAt)}
                </span>
              </div>

              {/* Messages */}
              {group.messages.map((msg, idx) => {
                const isOwn = msg.senderId === currentUserId;
                const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
                const showSender = !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId);

                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    showSender={showSender}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom button */}
      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className={cn(
            'absolute bottom-4 right-4 z-10',
            'w-10 h-10 rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            'flex items-center justify-center',
            'transition-transform active:scale-95'
          )}
        >
          <ChevronDown size={24} />
        </button>
      )}
    </div>
  );
};
