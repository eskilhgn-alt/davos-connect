/**
 * ChatThread - Complete Messenger-style chat UI
 * 
 * Layout:
 * - Fixed position shell using VisualViewport dimensions
 * - Header at top (flex-none)
 * - MessageList fills middle (flex-1, native scroll)
 * - Composer fixed at bottom above keyboard
 */

import * as React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { DavosEmptyState } from '@/components/ui/davos-empty-state';
import { MessageCircle } from 'lucide-react';
import { localChatService } from '@/services/chat.local';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { LocalMessage, MessageAttachment } from '@/services/contracts';

import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MediaViewer } from './MediaViewer';
import { ActionSheet } from './ActionSheet';
import { toast } from 'sonner';

const THREAD_ID = 'davos-crew';

export const ChatThread: React.FC = () => {
  const { user } = useCurrentUser();
  const [messages, setMessages] = React.useState<LocalMessage[]>([]);
  const [composerHeight, setComposerHeight] = React.useState(56);
  
  // Media viewer state
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerMedia, setViewerMedia] = React.useState<{ src: string; type: 'image' | 'gif' | 'video' } | null>(null);
  
  // Action sheet state
  const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
  const [selectedMessage, setSelectedMessage] = React.useState<LocalMessage | null>(null);
  
  const composerRef = React.useRef<HTMLDivElement>(null);

  // Subscribe to messages
  React.useEffect(() => {
    return localChatService.subscribeToMessages(THREAD_ID, setMessages);
  }, []);

  // Lock body scroll when chat is mounted (PWA shell behavior)
  React.useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Measure composer height for message list padding
  React.useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setComposerHeight(entry.borderBoxSize[0]?.blockSize || entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Send message handler
  const handleSend = React.useCallback((text: string, attachments: MessageAttachment[]) => {
    localChatService.sendMessage(THREAD_ID, {
      senderId: user.id,
      senderName: user.name,
      text,
      attachments,
    });
  }, [user.id, user.name]);

  // Long press handler
  const handleLongPress = React.useCallback((message: LocalMessage) => {
    setSelectedMessage(message);
    setActionSheetOpen(true);
  }, []);

  // Media click handler
  const handleMediaClick = React.useCallback((src: string, type: 'image' | 'gif' | 'video') => {
    setViewerMedia({ src, type });
    setViewerOpen(true);
  }, []);

  // Reaction handler
  const handleReactionTap = React.useCallback((messageId: string, emoji: string) => {
    localChatService.toggleReaction(messageId, emoji, user.id);
  }, [user.id]);

  // Action handlers
  const handleReact = React.useCallback((emoji: string) => {
    if (selectedMessage) {
      localChatService.toggleReaction(selectedMessage.id, emoji, user.id);
    }
  }, [selectedMessage, user.id]);

  const handleEdit = React.useCallback(() => {
    if (selectedMessage) {
      const newText = prompt('Rediger melding:', selectedMessage.text);
      if (newText !== null && newText.trim()) {
        localChatService.editMessage(selectedMessage.id, newText.trim());
        toast.success('Melding redigert');
      }
    }
  }, [selectedMessage]);

  const handleDelete = React.useCallback(() => {
    if (selectedMessage && confirm('Slett denne meldingen?')) {
      localChatService.deleteMessage(selectedMessage.id);
      toast.success('Melding slettet');
    }
  }, [selectedMessage]);

  const handleCopy = React.useCallback(() => {
    if (selectedMessage?.text) {
      navigator.clipboard.writeText(selectedMessage.text);
      toast.success('Kopiert til utklippstavle');
    }
  }, [selectedMessage]);

  // Calculate bottom padding: composer height + bottom nav (when visible) + safe area
  // When keyboard is open, --bottom-nav-h-effective is 0, so we just need composer + safe-area
  const getBottomPadding = () => {
    // Base: composer height + small gap
    return composerHeight + 16;
  };

  return (
    <>
      {/* Chat shell - fixed to viewport via CSS vars */}
      <div 
        className="fixed overflow-hidden bg-background flex flex-col"
        style={{
          height: 'var(--vvh, 100dvh)',
          top: 'var(--vvo, 0px)',
          left: 0,
          right: 0,
        }}
      >
        {/* Header - fixed at top */}
        <AppHeader 
          title="Chat" 
          subtitle="Davos Crew" 
          className="flex-none"
        />

        {/* Message list or empty state */}
        {messages.length > 0 ? (
          <MessageList
            messages={messages}
            currentUserId={user.id}
            onLongPress={handleLongPress}
            onMediaClick={handleMediaClick}
            onReactionTap={handleReactionTap}
            bottomPadding={getBottomPadding()}
          />
        ) : (
          <div 
            className="flex-1 min-h-0 flex items-center justify-center px-6"
            style={{ paddingBottom: getBottomPadding() }}
          >
            <DavosEmptyState
              icon={MessageCircle}
              title="Ingen meldinger ennå"
              description="Start samtalen med crewet ditt!"
            />
          </div>
        )}

        {/* Composer - sticky at bottom, positioned above keyboard via CSS vars */}
        <div
          ref={composerRef}
          className="absolute left-0 right-0 bg-background border-t border-border z-40"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px))',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <Composer onSend={handleSend} />
        </div>
      </div>

      {/* Media viewer */}
      {viewerMedia && (
        <MediaViewer
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          src={viewerMedia.src}
          type={viewerMedia.type}
        />
      )}

      {/* Action sheet */}
      <ActionSheet
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        message={selectedMessage}
        isOwn={selectedMessage?.senderId === user.id}
        onReact={handleReact}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />
    </>
  );
};
