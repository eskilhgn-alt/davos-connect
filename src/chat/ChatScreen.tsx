/**
 * ChatScreen - Messenger-style chat for iPhone PWA
 * Minimal header, white background
 */

import * as React from 'react';
import { Lock, MessageCircle, Sparkles, Images } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import { useVisualViewport } from './useVisualViewport';
import { chatStore } from './store';
import { oneSignalService } from '@/services/onesignal';
import { useAuth } from '@/contexts/AuthContext';
import { useTrip } from '@/contexts/TripContext';
import type { Message, Attachment, TypingState } from './types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

// CHAT-MEDIA-01: Stories og Minner gjenbruker eksisterende skjermer som paneler.
const StoriesPanel = React.lazy(() => import('@/pages/StoriesScreen'));
const MinnerPanel = React.lazy(() => import('@/pages/GalleryScreen'));
type Panel = 'stories' | 'minner' | null;

export const ChatScreen: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkMessageId = searchParams.get('message');
  const rawPanel = searchParams.get('panel');
  const panel: Panel = rawPanel === 'stories' || rawPanel === 'minner' ? rawPanel : null;
  const setPanel = React.useCallback((next: Panel) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next) p.set('panel', next); else p.delete('panel');
      if (next !== 'stories') p.delete('story');
      return p;
    }, { replace: true });
  }, [setSearchParams]);
  const { vvh, kb } = useVisualViewport();
  const chatLayerRef = React.useRef<HTMLDivElement>(null);
  const composerLayerRef = React.useRef<HTMLDivElement>(null);
  // Når et mediepanel åpnes: slipp fokus (lukker mobiltastaturet) fra skjulte chatlag.
  React.useEffect(() => {
    if (!panel) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (chatLayerRef.current?.contains(active) || composerLayerRef.current?.contains(active))) active.blur();
  }, [panel]);
  const hiddenLayer = (hidden: boolean) =>
    hidden ? ({ hidden: true, 'aria-hidden': true, inert: '' } as Record<string, unknown>) : {};
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
      <AppHeader
        title={selectedTrip ? `Chat · ${selectedTrip.name}` : 'Chat'}
        subtitle={isArchive ? 'Arkiv – skrivebeskyttet' : undefined}
      />

      {selectedTripId && (
        <div role="tablist" aria-label="Chat-visning" className="shrink-0 flex gap-1 px-2 border-b border-border bg-background">
          {([
            [null, 'Meldinger', MessageCircle],
            ['stories', 'Stories', Sparkles],
            ['minner', 'Minner', Images],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={panel === key}
              onClick={() => setPanel(key)}
              className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 text-xs font-medium border-b-2 ${
                panel === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {!selectedTripId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
          Ingen tur er valgt. Velg en tur på hjemsiden for å se chatten.
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* MessageList og Composer forblir montert mens paneler er åpne. */}
          <div ref={chatLayerRef} data-testid="chat-message-layer" className="flex-1 min-h-0 flex flex-col" {...hiddenLayer(!!panel)}>
          <MessageList
            messages={messages}
            currentUserId={userId}
            composerHeight={isArchive ? 56 : composerHeight}
            viewportHeight={vvh}
            isTyping={typingState.isTyping}
            deepLinkMessageId={deepLinkMessageId}
          />
          </div>
          {panel && (
            <div role="tabpanel" aria-label={panel === 'stories' ? 'Stories' : 'Minner'} className="absolute inset-0 z-20 bg-background">
              <React.Suspense fallback={<div className="p-6 text-center text-sm text-muted-foreground">Laster…</div>}>
                {panel === 'stories' ? <StoriesPanel embedded /> : <MinnerPanel embedded />}
              </React.Suspense>
            </div>
          )}
        </div>
      )}


      {selectedTripId && !isArchive && (
        <div
          ref={composerLayerRef}
          data-testid="chat-composer-layer"
          className="fixed left-0 right-0 z-10"
          style={{ bottom: `${kb}px` }}
          {...hiddenLayer(!!panel)}
        >
          <Composer onSend={handleSend} onHeightChange={handleComposerHeight} />
        </div>
      )}
      {selectedTripId && isArchive && !panel && (
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
