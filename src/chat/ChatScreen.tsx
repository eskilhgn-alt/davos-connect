/**
 * ChatScreen - Messenger-style chat for iPhone PWA
 * Minimal header, white background
 */

import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useVisualViewport } from './useVisualViewport';
import { chatStore } from './store';
import { oneSignalService } from '@/services/onesignal';
import { useAuth } from '@/contexts/AuthContext';
import type { Message, Attachment, TypingState } from './types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

export const ChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const { vvh, kb } = useVisualViewport();
  const { user, profile } = useAuth();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [composerHeight, setComposerHeight] = React.useState(80);
  const [typingState, setTypingState] = React.useState<TypingState>({ isTyping: false, lastTypedAt: 0 });

  const displayName = profile?.nickname || profile?.full_name || 'Ukjent';
  const userId = user?.id || '';

  React.useEffect(() => {
    if (userId) {
      oneSignalService.init(userId);
    }
  }, [userId]);

  React.useEffect(() => {
    document.body.classList.add('chat-lock');
    return () => {
      document.body.classList.remove('chat-lock');
    };
  }, []);

  React.useEffect(() => {
    return chatStore.subscribeToMessages(setMessages);
  }, []);

  React.useEffect(() => {
    return chatStore.subscribeToTyping(setTypingState);
  }, []);

  const handleSend = React.useCallback(async (text: string, attachments: Attachment[]) => {
    if (!userId) return;

    await chatStore.sendMessage(text, attachments, userId, displayName);

    const preview = attachments.length > 0 && !text
      ? `📷 ${attachments.length === 1 ? 'Bilde' : `${attachments.length} bilder`}`
      : text;

    oneSignalService.triggerPushNotification(
      DEFAULT_THREAD_ID,
      userId,
      displayName,
      preview
    );
  }, [userId, displayName]);

  const handleComposerHeight = React.useCallback((height: number) => {
    setComposerHeight(height);
  }, []);

  return (
    <div
      className="fixed left-0 right-0 flex flex-col overflow-hidden bg-background"
      style={{
        height: `${vvh}px`,
        top: 'var(--vvo, 0px)',
      }}
    >
      {/* Minimal header */}
      <header
        className={cn(
          'flex-none flex items-center gap-3 px-4 bg-background border-b border-border',
          'safe-area-top'
        )}
        style={{ minHeight: '56px' }}
      >
        <button
          type="button"
          onClick={() => navigate('/hjem')}
          className="tap-target flex items-center justify-center -ml-2 text-foreground"
        >
          <ArrowLeft size={22} strokeWidth={1.8} />
        </button>
        <h1 className="font-heading text-base font-semibold text-foreground tracking-tight">Chat</h1>
      </header>

      <MessageList
        messages={messages}
        currentUserId={userId}
        composerHeight={composerHeight}
        isTyping={typingState.isTyping}
      />

      <div
        className="fixed left-0 right-0 z-10"
        style={{ bottom: `${kb}px` }}
      >
        <Composer onSend={handleSend} onHeightChange={handleComposerHeight} />
      </div>
    </div>
  );
};

export default ChatScreen;
