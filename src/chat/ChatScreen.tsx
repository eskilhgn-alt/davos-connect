/**
 * ChatScreen - Messenger-style chat for iPhone PWA
 * 
 * Architecture:
 * - Fixed viewport container using VisualViewport
 * - Native scrolling for message list
 * - Composer fixed at bottom, above keyboard
 * - No BottomNavigation on this route
 */

import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useVisualViewport } from './useVisualViewport';
import { chatStore } from './store';
import { oneSignalService } from '@/services/onesignal';
import type { Message, Attachment, TypingState } from './types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

export const ChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const { vvh, kb } = useVisualViewport();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [composerHeight, setComposerHeight] = React.useState(80);
  const [typingState, setTypingState] = React.useState<TypingState>({ isTyping: false, lastTypedAt: 0 });
  const user = React.useMemo(() => chatStore.getUser(), []);

  // Initialize OneSignal on mount
  React.useEffect(() => {
    oneSignalService.init(user.id);
  }, [user.id]);

  // Lock body scroll on mount
  React.useEffect(() => {
    document.body.classList.add('chat-lock');
    return () => {
      document.body.classList.remove('chat-lock');
    };
  }, []);

  // Subscribe to messages
  React.useEffect(() => {
    return chatStore.subscribeToMessages(setMessages);
  }, []);

  // Subscribe to typing state
  React.useEffect(() => {
    return chatStore.subscribeToTyping(setTypingState);
  }, []);

  // Send message and trigger push notification
  const handleSend = React.useCallback((text: string, attachments: Attachment[]) => {
    chatStore.sendMessage(text, attachments);
    
    // Trigger push notification to other users
    const preview = attachments.length > 0 && !text 
      ? `📷 ${attachments.length === 1 ? 'Bilde' : `${attachments.length} bilder`}`
      : text;
    
    oneSignalService.triggerPushNotification(
      DEFAULT_THREAD_ID,
      user.id,
      user.name,
      preview
    );
  }, [user.id, user.name]);

  // Handle composer height change
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
      {/* Header - stable at top */}
      <header
        className={cn(
          'flex-none flex items-center gap-3 px-4 bg-primary text-primary-foreground',
          'safe-area-top'
        )}
        style={{ minHeight: '56px' }}
      >
        <button
          type="button"
          onClick={() => navigate('/mer')}
          className="tap-target flex items-center justify-center -ml-2"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="font-heading text-lg font-semibold">Davos Crew</h1>
      </header>

      {/* Message list - scrolls */}
      <MessageList
        messages={messages}
        currentUserId={user.id}
        composerHeight={composerHeight}
        isTyping={typingState.isTyping}
      />

      {/* Composer - fixed at bottom above keyboard */}
      <div
        className="fixed left-0 right-0 z-10"
        style={{
          bottom: `${kb}px`,
        }}
      >
        <Composer onSend={handleSend} onHeightChange={handleComposerHeight} />
      </div>
    </div>
  );
};

export default ChatScreen;
