/**
 * Composer - Message input with attachments, emoji, and GIFs
 * Fixed at bottom, stable, no iOS zoom
 */

import * as React from 'react';
import { Send, Camera, ImageIcon, X, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment } from './types';
import { chatStore } from './store';
import { EmojiPicker } from './EmojiPicker';
import { GiphyPicker } from './GiphyPicker';
interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onHeightChange: (height: number) => void;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, onHeightChange }) => {
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [showGiphyPicker, setShowGiphyPicker] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

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
    // Initial measurement
    onHeightChange(el.offsetHeight);

    return () => observer.disconnect();
  }, [onHeightChange]);

  // Auto-resize textarea
  const adjustHeight = React.useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 120; // ~6 lines
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, []);

  React.useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Typing indicator
  const handleTextChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    chatStore.setTyping(true);
  }, []);

  // Handle send
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
    chatStore.setTyping(false);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle file selection
  const handleFiles = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: Attachment[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        continue;
      }

      const objectUrl = URL.createObjectURL(file);
      newAttachments.push({
        id: crypto.randomUUID(),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        objectUrl,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
  };

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) {
        URL.revokeObjectURL(att.objectUrl);
      }
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
      // Set cursor after emoji
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
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
        }}
      >
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-4 py-2 overflow-x-auto">
            {attachments.map((att) => (
              <div key={att.id} className="relative flex-shrink-0">
                {att.kind === 'video' ? (
                  <video
                    src={att.objectUrl}
                    className="h-16 w-16 object-cover rounded-lg"
                  />
                ) : (
                  <img
                    src={att.objectUrl}
                    alt="Vedlegg"
                    className="h-16 w-16 object-cover rounded-lg"
                  />
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

        {/* Input row */}
        <div className="flex items-end gap-2 px-4 py-2">
          {/* Camera button - opens camera directly on iPhone */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Camera size={24} />
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Gallery button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageIcon size={24} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Emoji button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(true)}
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Smile size={24} />
          </button>

          {/* GIF button */}
          <button
            type="button"
            onClick={() => setShowGiphyPicker(true)}
            className="tap-target flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors font-semibold text-xs"
          >
            GIF
          </button>

          {/* Text input - 16px to prevent iOS zoom */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Skriv en melding..."
              rows={1}
              className={cn(
                'w-full resize-none rounded-2xl border border-input bg-background',
                'px-4 py-2',
                'text-[16px] leading-5', // 16px prevents iOS zoom
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
              )}
              style={{
                minHeight: '40px',
                maxHeight: '120px',
              }}
            />
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'tap-target flex items-center justify-center rounded-full',
              'w-10 h-10 transition-colors',
              canSend
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Send size={20} />
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
