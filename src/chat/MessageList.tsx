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
import { ReactionsDialog } from './ReactionsDialog';
import { MessageActionsSheet } from './MessageActionsSheet';
import { EmojiPicker } from './EmojiPicker';
import { MediaViewer } from '@/components/ui/MediaViewer';
import { chatStore } from './store';
import { useMarkAsRead } from './useMarkAsRead';
import { useAuth } from '@/contexts/AuthContext';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  composerHeight: number;
  isTyping: boolean;
  deepLinkMessageId?: string | null;
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
  deepLinkMessageId,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = React.useState(false);
  const isNearBottomRef = React.useRef(true);

  // Auth and mark-as-read
  const { user } = useAuth();
  const { markAsRead } = useMarkAsRead();

  // UI state
  const [activeMessage, setActiveMessage] = React.useState<Message | null>(null);
  const [showActionsSheet, setShowActionsSheet] = React.useState(false);
  const [showReactionsDialog, setShowReactionsDialog] = React.useState(false);
  const [reactionsToShow, setReactionsToShow] = React.useState<Record<string, string[]>>({});
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [emojiPickerMode, setEmojiPickerMode] = React.useState<'reaction' | 'compose'>('reaction');
  const [viewerMedia, setViewerMedia] = React.useState<{ src: string; type: 'image' | 'video' | 'gif' } | null>(null);

  const [loadingEarlier, setLoadingEarlier] = React.useState(false);
  const [hasMoreEarlier, setHasMoreEarlier] = React.useState(true);

  // Check if near bottom and trigger pagination on top
  const checkNearBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const threshold = 150;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isNearBottomRef.current = nearBottom;
    setShowJump(!nearBottom);

    // Load earlier when scrolled near top
    if (el.scrollTop < 80 && !loadingEarlier && hasMoreEarlier) {
      setLoadingEarlier(true);
      const prevHeight = el.scrollHeight;
      chatStore.loadEarlier()
        .then(({ hasMore }) => {
          setHasMoreEarlier(hasMore);
          // Preserve scroll position
          requestAnimationFrame(() => {
            const newHeight = el.scrollHeight;
            el.scrollTop = newHeight - prevHeight;
          });
        })
        .finally(() => setLoadingEarlier(false));
    }

    return nearBottom;
  }, [loadingEarlier, hasMoreEarlier]);

  // Scroll to bottom
  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const hasInitialScrolled = React.useRef(false);

  React.useEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(false);
          setTimeout(() => scrollToBottom(false), 100);
          setTimeout(() => scrollToBottom(false), 500);
        });
      });
    }
  }, [messages.length, scrollToBottom]);

  React.useEffect(() => {
    hasInitialScrolled.current = false;
    requestAnimationFrame(() => scrollToBottom(false));
    setTimeout(() => scrollToBottom(false), 200);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!hasInitialScrolled.current) return;
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [messages.length, scrollToBottom]);

  // Deep-link: bounded load-earlier loop until the message is present,
  // then scroll and briefly highlight.
  React.useEffect(() => {
    if (!deepLinkMessageId) return;
    let cancelled = false;
    (async () => {
      await chatStore.ensureMessageLoaded(deepLinkMessageId);
      if (cancelled) return;
      const attempts = [50, 250, 800];
      attempts.forEach((delay) => {
        setTimeout(() => {
          const el = document.getElementById(`msg-${deepLinkMessageId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-primary');
            setTimeout(() => el.classList.remove('ring-2', 'ring-primary'), 1600);
          }
        }, delay);
      });
    })();
    return () => { cancelled = true; };
  }, [deepLinkMessageId, messages.length]);

  // Channel status for a small, unobtrusive banner
  const [channelStatus, setChannelStatus] = React.useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline'>('idle');
  React.useEffect(() => chatStore.subscribeToChannelStatus(setChannelStatus), []);


  // Handle showing combined actions sheet (single tap)
  const handleShowActions = React.useCallback((message: Message) => {
    setActiveMessage(message);
    setShowActionsSheet(true);
  }, []);

  // Handle showing reactions dialog (tap on reaction pills)
  const handleShowReactions = React.useCallback((reactions: Record<string, string[]>) => {
    setReactionsToShow(reactions);
    setShowReactionsDialog(true);
  }, []);

  // Mark messages as read
  React.useEffect(() => {
    if (!user) return;
    const recentMessages = messages.slice(-20);
    recentMessages.forEach((msg) => {
      if (msg.senderId !== user.id && !msg.deletedAt) {
        markAsRead(msg.id, msg.senderId);
      }
    });
  }, [messages, user, markAsRead]);

  // Handle reaction from combined sheet
  const handleReact = React.useCallback((emoji: string) => {
    if (activeMessage) {
      chatStore.toggleReaction(activeMessage.id, emoji);
    }
    setShowActionsSheet(false);
    setActiveMessage(null);
  }, [activeMessage]);

  // Handle emoji selection from full picker
  const handleEmojiSelect = React.useCallback((emoji: string) => {
    if (emojiPickerMode === 'reaction' && activeMessage) {
      chatStore.toggleReaction(activeMessage.id, emoji);
    }
    setShowEmojiPicker(false);
    setActiveMessage(null);
  }, [activeMessage, emojiPickerMode]);

  // Handle actions
  const handleEdit = React.useCallback(() => {
    const msgId = activeMessage?.id;
    setShowActionsSheet(false);
    setActiveMessage(null);
    if (msgId) {
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
      chatStore.deleteMessage(msgId).catch((err) => {
        console.error('[Chat] delete failed', err);
        // Surface error visibly instead of just logging
        window.alert(err?.message || 'Kunne ikke slette meldingen.');
      });
    }
  }, [activeMessage]);

  const handleReply = React.useCallback(() => {
    if (activeMessage) {
      chatStore.setReplyTo({
        id: activeMessage.id,
        text: activeMessage.text,
        senderName: activeMessage.senderName,
        deleted: !!activeMessage.deletedAt,
      });
    }
    setShowActionsSheet(false);
    setActiveMessage(null);
  }, [activeMessage]);

  const handleCopy = React.useCallback(async () => {
    const text = activeMessage?.text;
    setShowActionsSheet(false);
    setActiveMessage(null);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    }
  }, [activeMessage]);

  // Get user name for reactions dialog
  const getUserName = React.useCallback((uid: string) => {
    if (uid === currentUserId) return 'Du';
    const msg = messages.find(m => m.senderId === uid);
    return msg?.senderName || 'Ukjent';
  }, [messages, currentUserId]);

  const groups = groupMessagesByDate(messages);
  const paddingBottom = composerHeight + 16;

  return (
    <div className="relative flex-1 min-h-0">
      {(channelStatus === 'reconnecting' || channelStatus === 'offline') && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground shadow-sm"
        >
          {channelStatus === 'reconnecting' ? 'Kobler til på nytt…' : 'Frakoblet'}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className="h-full overflow-y-auto overscroll-contain"
        style={{ paddingBottom, WebkitOverflowScrolling: 'touch' }}
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
              <div className="flex justify-center py-3">
                <span className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                  {formatDateSeparator(group.messages[0].createdAt)}
                </span>
              </div>

              {group.messages.map((msg, idx) => {
                const isOwn = msg.senderId === currentUserId;
                const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
                const showSender = !prevMsg || prevMsg.senderId !== msg.senderId;

                  return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    showSender={showSender}
                    currentUserId={currentUserId}
                    onShowActions={handleShowActions}
                    onShowReactions={handleShowReactions}
                    onMediaTap={(src, type) => setViewerMedia({ src, type })}
                  />
                );
              })}
            </div>
          ))}

          {isTyping && isNearBottomRef.current && <TypingBubble />}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom */}
      {showJump && (
        <button
          type="button"
          aria-label="Bla til nyeste meldinger"
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

      {/* Combined Actions Sheet (reactions + seen-by + actions) */}
      {showActionsSheet && activeMessage && (
        <MessageActionsSheet
          messageId={activeMessage.id}
          isOwn={activeMessage.senderId === currentUserId}
          onEdit={activeMessage.senderId === currentUserId ? handleEdit : undefined}
          onDelete={activeMessage.senderId === currentUserId ? handleDelete : undefined}
          onReply={activeMessage.deletedAt ? undefined : handleReply}
          onCopy={handleCopy}
          onReact={handleReact}
          onClose={() => {
            setShowActionsSheet(false);
            setActiveMessage(null);
          }}
        />
      )}

      {/* Reactions Dialog (tap on reaction pills under message) */}
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

      {/* Media Viewer */}
      {viewerMedia && (
        <MediaViewer
          open={true}
          src={viewerMedia.src}
          type={viewerMedia.type}
          onClose={() => setViewerMedia(null)}
        />
      )}
    </div>
  );
};
