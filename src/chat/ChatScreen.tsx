/**
 * ChatScreen - Messenger-style chat for iPhone PWA
 * Minimal header, white background
 */

import * as React from 'react';
import { ArrowLeft, Home, Lock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useVisualViewport } from './useVisualViewport';
import { chatStore } from './store';
import { oneSignalService } from '@/services/onesignal';
import { useAuth } from '@/contexts/AuthContext';
import { useTrip } from '@/contexts/TripContext';
import type { Message, Attachment, TypingState } from './types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

export const ChatScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkMessageId = searchParams.get('message');
  const { vvh, kb } = useVisualViewport();
  const { user, profile } = useAuth();
  const { selectedTripId, selectedTrip, isArchive } = useTrip();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [composerHeight, setComposerHeight] = React.useState(80);
  const [typingState, setTypingState] = React.useState<TypingState>({ isTyping: false, lastTypedAt: 0 });

  const displayName = profile?.nickname || profile?.full_name || 'Ukjent';
  const userId = user?.id || '';

  React.useEffect(() => {
    if (userId) {
      oneSignalService.init(userId).catch((err) => {
        console.warn("[ChatScreen] OneSignal init failed:", err);
      });
    }
  }, [userId]);

  React.useEffect(() => {
    document.body.classList.add('chat-lock');
    return () => {
      document.body.classList.remove('chat-lock');
    };
  }, []);

  // Bind the chat store to the currently selected trip. Switching trip clears
  // the store, tears down realtime and reloads the new trip's messages.
  React.useEffect(() => {
    chatStore.setTrip(selectedTripId, isArchive);
  }, [selectedTripId, isArchive]);

  React.useEffect(() => {
    if (!selectedTripId) return;
    return chatStore.subscribeToMessages(setMessages);
  }, [selectedTripId]);

  React.useEffect(() => {
    if (!selectedTripId || isArchive) return;
    return chatStore.subscribeToTyping(setTypingState);
  }, [selectedTripId, isArchive]);

  const handleSend = React.useCallback(async (text: string, attachments: Attachment[]) => {
    if (!userId) return;
    // store.sendMessage handles optimistic UI, upload, insert AND push after successful insert.
    await chatStore.sendMessage(text, attachments, userId, displayName);
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
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-base font-semibold text-foreground tracking-tight leading-tight truncate">
            Chat{selectedTrip ? ` · ${selectedTrip.name}` : ''}
          </h1>
          {isArchive && (
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mt-0.5">
              <Lock size={10} /> Arkiv – skrivebeskyttet
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/hjem')}
          className="tap-target flex items-center justify-center -mr-2 w-9 h-9 rounded-full bg-[#103A5D] border border-[#F4CD3C]/40"
        >
          <Home size={16} strokeWidth={2} className="text-[#F4CD3C]" />
        </button>
      </header>

      {!selectedTripId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
          Ingen tur er valgt. Velg en tur i «Mer» for å se chatten.
        </div>
      ) : (
        <MessageList
          messages={messages}
          currentUserId={userId}
          composerHeight={isArchive ? 56 : composerHeight}
          viewportHeight={vvh}
          isTyping={typingState.isTyping}
          deepLinkMessageId={deepLinkMessageId}
        />
      )}


      {selectedTripId && !isArchive && (
        <div
          className="fixed left-0 right-0 z-10"
          style={{ bottom: `${kb}px` }}
        >
          <Composer onSend={handleSend} onHeightChange={handleComposerHeight} />
        </div>
      )}
      {selectedTripId && isArchive && (
        <div
          className="fixed left-0 right-0 z-10 bg-muted/90 backdrop-blur border-t border-border px-4 py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"
          style={{ bottom: `${kb}px` }}
          role="status"
          aria-label="Arkiv – skrivebeskyttet"
        >
          <Lock size={12} />
          <span>Arkiv – skrivebeskyttet. Du kan lese, men ikke skrive nye meldinger.</span>
        </div>
      )}
    </div>
  );
};

export default ChatScreen;
