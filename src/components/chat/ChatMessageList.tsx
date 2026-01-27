import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  onEditMessage: (messageId: string) => void;
  className?: string;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  currentUserId,
  currentUserName,
  showTypingIndicator = false,
  onEditMessage,
  className,
}) => {
  const [showTimestamps, setShowTimestamps] = React.useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
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
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, []);

  // Detect scroll position
  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    isAtBottomRef.current = distanceFromBottom < 50;
    setShowScrollToBottom(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleToggleTimestamp = () => {
    setShowTimestamps(prev => !prev);
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
    <div className={cn("relative flex-1 overflow-hidden", className)}>
      <ScrollArea className="h-full">
        <div 
          ref={scrollAreaRef}
          className="flex flex-col py-4"
          onScroll={handleScroll}
        >
          {groupedMessages.map((group, groupIndex) => (
            <React.Fragment key={group.date.toISOString()}>
              <DateSeparator date={group.date} />
              
              {group.messages.map((message, messageIndex) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  isOwnMessage={message.senderId === currentUserId}
                  showTimestamp={showTimestamps}
                  showSenderName={shouldShowSenderName(message, messageIndex, group.messages)}
                  onToggleTimestamp={handleToggleTimestamp}
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
      </ScrollArea>

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
