import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { ChatMessageList, ChatComposer } from "@/components/chat";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DavosButton } from "@/components/ui/davos-button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { localChatService } from "@/services/chat.local";
import type { LocalMessage, MessageAttachment } from "@/services/contracts";
import { MessageCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const THREAD_ID = 'davos-crew';
const FIRST_TIME_KEY = 'davos_chat_first_time';

export const ChatScreen: React.FC = () => {
  const { user, updateName, isCurrentUser } = useCurrentUser();
  const { toast } = useToast();
  
  const [messages, setMessages] = React.useState<LocalMessage[]>([]);
  const [showTypingIndicator, setShowTypingIndicator] = React.useState(false);
  const [showTimestamps, setShowTimestamps] = React.useState(false);
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [nameDialogOpen, setNameDialogOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  
  // Typing indicator refs for debounce
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTypingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to messages
  React.useEffect(() => {
    const unsubscribe = localChatService.subscribeToMessages(THREAD_ID, (msgs) => {
      setMessages(msgs);
    });
    return unsubscribe;
  }, []);

  // First-time toast
  React.useEffect(() => {
    const hasSeenTip = localStorage.getItem(FIRST_TIME_KEY);
    if (!hasSeenTip) {
      const timer = setTimeout(() => {
        toast({
          title: "Tips",
          description: "Hold inne en melding for reaksjoner og meny. Trykk for å vise tid.",
          duration: 5000,
        });
        localStorage.setItem(FIRST_TIME_KEY, 'true');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Simulate message status progression
  const simulateStatusProgression = React.useCallback((messageId: string) => {
    // Delivered after 300ms
    setTimeout(() => {
      localChatService.updateMessageStatus(messageId, 'delivered');
    }, 300);
    
    // Seen after 1.5s
    setTimeout(() => {
      localChatService.updateMessageStatus(messageId, 'seen');
    }, 1500);
  }, []);

  const handleSendMessage = (text: string, attachments: MessageAttachment[]) => {
    const message = localChatService.sendMessage(THREAD_ID, {
      senderId: user.id,
      senderName: user.name,
      text,
      attachments,
    });
    
    // Simulate status progression
    simulateStatusProgression(message.id);
    
    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (hideTypingTimeoutRef.current) {
      clearTimeout(hideTypingTimeoutRef.current);
      hideTypingTimeoutRef.current = null;
    }
    setShowTypingIndicator(false);
  };

  // Proper debounced typing indicator
  const handleTyping = React.useCallback((isTyping: boolean) => {
    if (isTyping) {
      // Clear any existing hide timeout
      if (hideTypingTimeoutRef.current) {
        clearTimeout(hideTypingTimeoutRef.current);
        hideTypingTimeoutRef.current = null;
      }
      
      // Debounce: only show after 600ms of continuous typing
      if (!typingTimeoutRef.current) {
        typingTimeoutRef.current = setTimeout(() => {
          setShowTypingIndicator(true);
          typingTimeoutRef.current = null;
        }, 600);
      }
    } else {
      // Clear show timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Hide after 1 second of no typing
      if (!hideTypingTimeoutRef.current) {
        hideTypingTimeoutRef.current = setTimeout(() => {
          setShowTypingIndicator(false);
          hideTypingTimeoutRef.current = null;
        }, 1000);
      }
    }
  }, []);

  const handleToggleTimestamps = React.useCallback(() => {
    setShowTimestamps(prev => !prev);
  }, []);

  const handleEditMessage = (messageId: string) => {
    const message = localChatService.getMessage(messageId);
    if (message && isCurrentUser(message.senderId)) {
      setEditingMessageId(messageId);
      setEditText(message.text);
    }
  };

  const handleSaveEdit = () => {
    if (editingMessageId && editText.trim()) {
      localChatService.editMessage(editingMessageId, editText.trim());
      setEditingMessageId(null);
      setEditText('');
      toast({
        title: "Melding redigert",
        duration: 2000,
      });
    }
  };

  const handleSaveName = () => {
    if (newName.trim()) {
      updateName(newName.trim());
      setNameDialogOpen(false);
      setNewName('');
      toast({
        title: "Navn oppdatert",
        description: `Du heter nå "${newName.trim()}"`,
        duration: 2000,
      });
    }
  };

  const openNameDialog = () => {
    setNewName(user.name);
    setNameDialogOpen(true);
  };

  const hasMessages = messages.length > 0;

  // Track composer height for message list padding
  const composerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    const updateComposerHeight = () => {
      const height = composer.offsetHeight;
      document.documentElement.style.setProperty('--composer-h', `${height}px`);
    };

    // Initial measurement
    updateComposerHeight();

    // Watch for size changes
    const resizeObserver = new ResizeObserver(updateComposerHeight);
    resizeObserver.observe(composer);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div 
      className="relative flex flex-col overflow-hidden"
      style={{ height: 'var(--app-height)' }}
    >
      {/* Sticky header */}
      <AppHeader 
        title="Chat" 
        subtitle="Davos Crew"
        rightAction={
          <button
            type="button"
            onClick={openNameDialog}
            className="tap-target p-2 text-primary-foreground/70 hover:text-primary-foreground rounded-full transition-colors"
          >
            <Settings size={20} />
          </button>
        }
      />
      
      {/* Message list or empty state */}
      {hasMessages ? (
        <ChatMessageList
          messages={messages}
          currentUserId={user.id}
          currentUserName={user.name}
          showTypingIndicator={showTypingIndicator}
          showTimestamps={showTimestamps}
          onToggleTimestamps={handleToggleTimestamps}
          onEditMessage={handleEditMessage}
          className="flex-1"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center px-6 overflow-y-auto">
          <DavosEmptyState
            icon={MessageCircle}
            title="Start en samtale"
            description="Send tekst, emoji, GIF, bilde eller video. Hold inne en melding for reaksjoner og meny – trykk for å vise tidspunkt."
          />
        </div>
      )}
      
      {/* Composer - fixed to bottom, adjusts for keyboard */}
      <div 
        ref={composerRef}
        className="z-30 bg-background"
        style={{ 
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(var(--keyboard-inset) + var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px))',
          transition: 'bottom 0.1s ease-out'
        }}
      >
        <ChatComposer
          onSend={handleSendMessage}
          onTyping={handleTyping}
        />
      </div>

      {/* Edit message dialog */}
      <Dialog open={!!editingMessageId} onOpenChange={(open) => !open && setEditingMessageId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rediger melding</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Skriv ny tekst..."
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
            />
          </div>
          <DialogFooter>
            <DavosButton variant="secondary" onClick={() => setEditingMessageId(null)}>
              Avbryt
            </DavosButton>
            <DavosButton variant="primary" onClick={handleSaveEdit}>
              Lagre
            </DavosButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Name change dialog */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Endre visningsnavn</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ditt navn..."
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            />
          </div>
          <DialogFooter>
            <DavosButton variant="secondary" onClick={() => setNameDialogOpen(false)}>
              Avbryt
            </DavosButton>
            <DavosButton variant="primary" onClick={handleSaveName}>
              Lagre
            </DavosButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatScreen;
