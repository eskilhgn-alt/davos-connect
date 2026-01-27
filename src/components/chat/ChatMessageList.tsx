import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSameDay } from 'date-fns';
import type { LocalMessage } from '@/services/contracts';
import { ChatMessageBubble } from './ChatMessageBubble';
import { DateSeparator } from './DateSeparator';
import { TypingIndicator } from './TypingIndicator';
import { localChatService } from '@/services/chat.local';

interface ChatMessageListProps {
  messages: LocalMessage[];
  currentUserId: string;
  currentUserName: string;
  showTypingIndicator?: boolean;
  showTimestamps: boolean;
  onToggleTimestamps: () => void;
  onEditMessage: (messageId: string) => void;
  className?: string;
  /** Extra bottom padding to account for composer height */
  bottomPadding?: number;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  currentUserId,
  currentUserName,
  showTypingIndicator = false,
  showTimestamps,
  onToggleTimestamps,
  onEditMessage,
  className,
  bottomPadding = 72,
}) => {
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);
  const prevMessageCountRef = React.useRef(messages.length);

  // Scroll to bottom on new messages (if user was at bottom)
  React.useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  // Detect scroll position
  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    isAtBottomRef.current = distanceFromBottom < 50;
    setShowScrollToBottom(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReaction = (messageId: string, emoji: string) => {
    localChatService.toggleReaction(messageId, emoji, currentUserId);
  };

  const handleDelete = (messageId: string) => {
    localChatService.deleteMessage(messageId);
  };

  const handleCopy = () => {
    // Toast will be handled by parent
  };

  // Group messages by date
  const groupedMessages = React.useMemo(() => {
    const groups: { date: Date; messages: LocalMessage[] }[] = [];
    let currentGroup: { date: Date; messages: LocalMessage[] } | null = null;

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      
      if (!currentGroup || !isSameDay(currentGroup.date, messageDate)) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      
      currentGroup.messages.push(message);
    });

    return groups;
  }, [messages]);

  // Determine if we should show sender name (for grouping)
  const shouldShowSenderName = (message: LocalMessage, index: number, groupMessages: LocalMessage[]) => {
    if (message.senderId === currentUserId) return false;
    if (index === 0) return true;
    return groupMessages[index - 1].senderId !== message.senderId;
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Scroll container - fills available space */}
      <div 
        ref={scrollContainerRef}
        className="h-full overflow-y-auto overscroll-contain"
        onScroll={handleScroll}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: bottomPadding,
        }}
      >
        <div className="flex flex-col py-4 px-2">
          {groupedMessages.map((group) => (
            <React.Fragment key={group.date.toISOString()}>
              <DateSeparator date={group.date} />
              
              {group.messages.map((message, messageIndex) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  isOwnMessage={message.senderId === currentUserId}
                  showTimestamp={showTimestamps}
                  showSenderName={shouldShowSenderName(message, messageIndex, group.messages)}
                  onToggleTimestamp={onToggleTimestamps}
                  onEdit={() => onEditMessage(message.id)}
                  onDelete={() => handleDelete(message.id)}
                  onReact={(emoji) => handleReaction(message.id, emoji)}
                  onCopy={handleCopy}
                  currentUserId={currentUserId}
                />
              ))}
            </React.Fragment>
          ))}

          {showTypingIndicator && <TypingIndicator />}
          
          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-4 right-4 z-10",
            "w-10 h-10 rounded-full bg-primary text-primary-foreground",
            "flex items-center justify-center shadow-lg",
            "hover:bg-primary/90 transition-all",
            "animate-in fade-in zoom-in-95"
          )}
        >
          <ArrowDown size={20} />
        </button>
      )}
    </div>
  );
};
