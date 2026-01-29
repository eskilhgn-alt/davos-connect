/**
 * MessageList - Scrollable message container with typing indicator
 * Native scrolling, auto-scroll, "jump to bottom" button
 */

import * as React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { nb } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from './types';
import { MessageItem } from './MessageItem';
import { TypingBubble } from './TypingBubble';
import { ReactionBar } from './ReactionBar';
import { ReactionsDialog } from './ReactionsDialog';
import { MessageActionsSheet } from './MessageActionsSheet';
import { EmojiPicker } from './EmojiPicker';
import { chatStore } from './store';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  composerHeight: number;
  isTyping: boolean;
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
  isTyping,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = React.useState(false);
  const isNearBottomRef = React.useRef(true);

  // UI state
  const [activeMessage, setActiveMessage] = React.useState<Message | null>(null);
  const [showActionsSheet, setShowActionsSheet] = React.useState(false);
  const [showReactionBar, setShowReactionBar] = React.useState(false);
  const [showReactionsDialog, setShowReactionsDialog] = React.useState(false);
  const [reactionsToShow, setReactionsToShow] = React.useState<Record<string, string[]>>({});
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [emojiPickerMode, setEmojiPickerMode] = React.useState<'reaction' | 'compose'>('reaction');

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

  // Handle showing actions
  const handleShowActions = React.useCallback((message: Message) => {
    setActiveMessage(message);
    setShowActionsSheet(true);
  }, []);

  // Handle showing reactions dialog
  const handleShowReactions = React.useCallback((reactions: Record<string, string[]>) => {
    setReactionsToShow(reactions);
    setShowReactionsDialog(true);
  }, []);

  // Handle reaction from bar
  const handleReact = React.useCallback((emoji: string) => {
    if (activeMessage) {
      chatStore.toggleReaction(activeMessage.id, emoji);
    }
    setShowReactionBar(false);
    setActiveMessage(null);
  }, [activeMessage]);

  // Handle opening emoji picker for reaction
  const handleOpenReactionPicker = React.useCallback(() => {
    setEmojiPickerMode('reaction');
    setShowReactionBar(false);
    setShowEmojiPicker(true);
  }, []);

  // Handle emoji selection
  const handleEmojiSelect = React.useCallback((emoji: string) => {
    if (emojiPickerMode === 'reaction' && activeMessage) {
      chatStore.toggleReaction(activeMessage.id, emoji);
    }
    setShowEmojiPicker(false);
    setActiveMessage(null);
  }, [activeMessage, emojiPickerMode]);

  // Handle actions from sheet
  const handleEdit = React.useCallback(() => {
    const msgId = activeMessage?.id;
    setShowActionsSheet(false);
    setActiveMessage(null);
    
    if (msgId) {
      // Trigger edit mode via window function (after state cleanup)
      requestAnimationFrame(() => {
        const editFn = (window as unknown as Record<string, () => void>)[`editMessage_${msgId}`];
        if (editFn) editFn();
      });
    }
  }, [activeMessage]);

  const handleDelete = React.useCallback(() => {
    const msgId = activeMessage?.id;
    setShowActionsSheet(false);
    setActiveMessage(null);
    
    if (msgId) {
      chatStore.deleteMessage(msgId);
    }
  }, [activeMessage]);

  const handleCopy = React.useCallback(async () => {
    const text = activeMessage?.text;
    setShowActionsSheet(false);
    setActiveMessage(null);
    
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    }
  }, [activeMessage]);

  const handleShowReactionBar = React.useCallback(() => {
    // Keep activeMessage intact for reaction bar
    setShowActionsSheet(false);
    setShowReactionBar(true);
  }, []);

  // Get user name for reactions dialog
  const getUserName = React.useCallback((userId: string) => {
    const currentUser = chatStore.getUser();
    if (userId === currentUser.id) return 'Du';
    // Find in messages
    const msg = messages.find(m => m.senderId === userId);
    return msg?.senderName || 'Ukjent';
  }, [messages]);

  const groups = groupMessagesByDate(messages);
  const paddingBottom = composerHeight + 16;

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
                    currentUserId={currentUserId}
                    onShowActions={handleShowActions}
                    onShowReactions={handleShowReactions}
                  />
                );
              })}
            </div>
          ))}

          {/* Typing indicator - only show when near bottom */}
          {isTyping && isNearBottomRef.current && (
            <TypingBubble />
          )}
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

      {/* Actions Sheet */}
      {showActionsSheet && activeMessage && (
        <MessageActionsSheet
          isOwn={activeMessage.senderId === currentUserId}
          onEdit={activeMessage.senderId === currentUserId ? handleEdit : undefined}
          onDelete={activeMessage.senderId === currentUserId ? handleDelete : undefined}
          onCopy={handleCopy}
          onReact={handleShowReactionBar}
          onClose={() => {
            setShowActionsSheet(false);
            setActiveMessage(null);
          }}
        />
      )}

      {/* Reaction Bar */}
      {showReactionBar && activeMessage && (
        <ReactionBar
          onReact={handleReact}
          onOpenPicker={handleOpenReactionPicker}
          onClose={() => {
            setShowReactionBar(false);
            setActiveMessage(null);
          }}
          position="bottom"
        />
      )}

      {/* Reactions Dialog */}
      {showReactionsDialog && (
        <ReactionsDialog
          reactions={reactionsToShow}
          getUserName={getUserName}
          onClose={() => setShowReactionsDialog(false)}
        />
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => {
            setShowEmojiPicker(false);
            setActiveMessage(null);
          }}
        />
      )}
    </div>
  );
};
