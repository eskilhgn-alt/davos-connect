/**
 * Composer - iMessage-style message input with reply preview and file attachments.
 */

import * as React from 'react';
import { Send, Camera, ImageIcon, X, Smile, Paperclip, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment, ReplyPreview } from './types';
import { chatStore } from './store';
import { EmojiPicker } from './EmojiPicker';
import { GiphyPicker } from './GiphyPicker';
import { useAuth } from '@/contexts/AuthContext';
import { errorToast } from '@/utils/errorToast';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void | Promise<void>;
  onHeightChange: (height: number) => void;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, onHeightChange }) => {
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<ReplyPreview | null>(null);
  const [sending, setSending] = React.useState(false);
  const { user, profile } = useAuth();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const docInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => chatStore.subscribeToReplyTo(setReplyTo), []);

  // Measure and report height
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onHeightChange(entry.contentRect.height);
      }
    });

    observer.observe(el);
    onHeightChange(el.offsetHeight);

    return () => observer.disconnect();
  }, [onHeightChange]);

  // Auto-resize textarea
  const adjustHeight = React.useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 140; // ~7 lines
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, []);

  React.useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Typing indicator via realtime broadcast
  const handleTextChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (user) {
      const name = profile?.nickname || profile?.full_name || 'Noen';
      chatStore.setTyping(true, { id: user.id, name });
    }
  }, [user, profile]);

  // Handle send – idempotent, non-blocking after enqueue
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (sending) return;
    setSending(true);

    Promise.resolve(onSend(trimmed, attachments))
      .catch((err) => { console.error('[Composer] Send failed:', err); })
      .finally(() => setSending(false));

    // Clear immediately so user can keep typing the next message.
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle media selection (images/video)
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        errorToast('Filen er for stor (maks 20 MB).');
        continue;
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      newAttachments.push({
        id: crypto.randomUUID(),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        objectUrl: URL.createObjectURL(file),
        file,
      });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  // Handle generic file/PDF selection
  const handleDocs = (files: FileList | null) => {
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        errorToast('Filen er for stor (maks 20 MB).');
        continue;
      }
      newAttachments.push({
        id: crypto.randomUUID(),
        kind: 'file',
        objectUrl: URL.createObjectURL(file),
        file,
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  };


  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) URL.revokeObjectURL(att.objectUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // Handle emoji selection
  const handleEmojiSelect = (emoji: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + emoji.length, start + emoji.length);
      });
    } else {
      setText((prev) => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  // Handle GIF selection
  const handleGifSelect = (gifUrl: string) => {
    const gifAttachment: Attachment = {
      id: crypto.randomUUID(),
      kind: 'gif',
      objectUrl: gifUrl,
    };
    setAttachments((prev) => [...prev, gifAttachment]);
    setShowGiphyPicker(false);
  };

  const canSend = text.trim() || attachments.length > 0;

  return (
    <>
      <div
        ref={containerRef}
        className="bg-background border-t border-border"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-3 pt-2 overflow-x-auto">
            {attachments.map((att) => (
              <div key={att.id} className="relative flex-shrink-0">
                {att.kind === 'video' ? (
                  <video src={att.objectUrl} className="h-16 w-16 object-cover rounded-lg" />
                ) : (
                  <img src={att.objectUrl} alt="Vedlegg" className="h-16 w-16 object-cover rounded-lg" />
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 mx-3 my-2 px-3 py-2 rounded-lg bg-muted border-l-2 border-primary">
            <Reply size={14} className="text-muted-foreground flex-none" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Svarer {replyTo.senderName || 'melding'}
              </p>
              <p className="text-xs text-foreground truncate">
                {replyTo.deleted ? 'Slettet melding' : (replyTo.text || 'Vedlegg')}
              </p>
            </div>
            <button
              type="button"
              aria-label="Avbryt svar"
              onClick={() => chatStore.setReplyTo(null)}
              className="w-6 h-6 rounded-full bg-background text-foreground flex items-center justify-center flex-none"
            >
              <X size={14} />
            </button>
          </div>
        )}

                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea row – full width with send button */}
        <div className="flex items-end gap-2 px-3 pt-2 pb-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Skriv en melding..."
            rows={1}
            className={cn(
              'flex-1 min-w-0 resize-none rounded-2xl border border-input bg-muted/50',
              'px-4 py-3',
              'text-[16px] leading-[22px]', // 16px prevents iOS zoom
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring'
            )}
            style={{
              minHeight: '44px',
              maxHeight: '140px',
            }}
          />

          {/* Send button */}
          <button
            type="button"
            aria-label="Send melding"
            onClick={handleSend}
            disabled={!canSend || sending}
            className={cn(
              'flex-none flex items-center justify-center rounded-full',
              'w-11 h-11 transition-colors mb-[1px]',
              canSend
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Send size={20} />
          </button>
        </div>

        {/* Toolbar row – action buttons */}
        <div className="flex items-center gap-1 px-3 pb-1">
          <button
            type="button"
            aria-label="Ta bilde"
            onClick={() => cameraInputRef.current?.click()}
            className="tap-target flex items-center justify-center text-muted-foreground active:text-foreground transition-colors"
          >
            <Camera size={22} />
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <button
            type="button"
            aria-label="Legg til bilde eller video"
            onClick={() => fileInputRef.current?.click()}
            className="tap-target flex items-center justify-center text-muted-foreground active:text-foreground transition-colors"
          >
            <ImageIcon size={22} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <button
            type="button"
            aria-label="Legg til fil"
            onClick={() => docInputRef.current?.click()}
            className="tap-target flex items-center justify-center text-muted-foreground active:text-foreground transition-colors"
          >
            <Paperclip size={22} />
          </button>
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,text/plain,text/csv"
            multiple
            className="hidden"
            onChange={(e) => handleDocs(e.target.files)}
          />

          <button
            type="button"
            aria-label="Legg til emoji"
            onClick={() => setShowEmojiPicker(true)}
            className="tap-target flex items-center justify-center text-muted-foreground active:text-foreground transition-colors"
          >
            <Smile size={22} />
          </button>

          <button
            type="button"
            aria-label="Legg til GIF"
            onClick={() => setShowGiphyPicker(true)}
            className="tap-target flex items-center justify-center text-muted-foreground active:text-foreground transition-colors font-semibold text-xs"
          >
            GIF
          </button>
        </div>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Giphy Picker */}
      {showGiphyPicker && (
        <GiphyPicker
          onSelect={handleGifSelect}
          onClose={() => setShowGiphyPicker(false)}
        />
      )}
    </>
  );
};
