/**
 * MessageList - Scrollable message container
 * 
 * Features:
 * - Native scrolling (no Radix ScrollArea)
 * - Auto-scroll to bottom on new messages
 * - Date separators
 * - "Jump to bottom" button when scrolled up
 * - Keyboard-aware auto-scroll
 */

import * as React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LocalMessage } from '@/services/contracts';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: LocalMessage[];
  currentUserId: string;
  onLongPress: (message: LocalMessage) => void;
  onMediaClick: (src: string, type: 'image' | 'gif' | 'video') => void;
  onReactionTap: (messageId: string, emoji: string) => void;
  bottomPadding?: number;
}

function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  if (isToday(date)) return 'I dag';
  if (isYesterday(date)) return 'I går';
  return format(date, 'd. MMMM yyyy', { locale: nb });
}

function groupMessagesByDate(messages: LocalMessage[]) {
  const groups: { date: string; messages: LocalMessage[] }[] = [];
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
  onLongPress,
  onMediaClick,
  onReactionTap,
  bottomPadding = 80,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [showJumpButton, setShowJumpButton] = React.useState(false);
  const isAtBottomRef = React.useRef(true);

  // Check if at bottom
  const checkAtBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 100;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setShowJumpButton(!atBottom);
    return atBottom;
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = React.useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ 
      behavior: smooth ? 'smooth' : 'auto' 
    });
  }, []);

  // Initial scroll to bottom
  React.useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Scroll to bottom on new messages if already at bottom
  React.useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [messages.length, scrollToBottom]);

  // Listen for keyboard state changes
  React.useEffect(() => {
    const handleKeyboard = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.open && isAtBottomRef.current) {
        // Scroll to bottom when keyboard opens and user was at bottom
        requestAnimationFrame(() => {
          setTimeout(() => scrollToBottom(true), 100);
        });
      }
    };

    window.addEventListener('keyboard-state-change', handleKeyboard);
    return () => window.removeEventListener('keyboard-state-change', handleKeyboard);
  }, [scrollToBottom]);

  const groups = groupMessagesByDate(messages);

  return (
    <div className="relative flex-1 min-h-0">
      {/* Scroll container - native scrolling */}
      <div
        ref={scrollRef}
        onScroll={checkAtBottom}
        className="h-full overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: bottomPadding,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="py-4">
          {groups.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex justify-center py-4">
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
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    showSender={showSender}
                    currentUserId={currentUserId}
                    onLongPress={onLongPress}
                    onMediaClick={onMediaClick}
                    onReactionTap={(emoji) => onReactionTap(msg.id, emoji)}
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
      {showJumpButton && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className={cn(
            "absolute bottom-4 right-4 z-10",
            "w-10 h-10 rounded-full",
            "bg-primary text-primary-foreground shadow-lg",
            "flex items-center justify-center",
            "transition-transform hover:scale-105 active:scale-95"
          )}
        >
          <ChevronDown size={24} />
        </button>
      )}
    </div>
  );
};
