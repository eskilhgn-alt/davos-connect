/**
 * Chat Composer - Messenger-style input
 * 
 * Features:
 * - 16px font to prevent iOS zoom
 * - Camera + Library attachment buttons
 * - Emoji picker
 * - Auto-grow textarea
 * - Attachment preview before sending
 */

import * as React from 'react';
import { Send, Plus, Camera, X, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageAttachment } from '@/services/contracts';
import { mediaStorage } from '@/services/media-storage';
import { createThumbnail, createVideoThumbnail } from '@/utils/imageThumb';

interface PendingAttachment {
  id: string;
  file: File;
  type: 'image' | 'video';
  previewUrl: string;
}

interface ComposerProps {
  onSend: (text: string, attachments: MessageAttachment[]) => void;
  disabled?: boolean;
}

// Simple emoji set - no external dependencies
const QUICK_EMOJIS = ['😀', '❤️', '😂', '👍', '🔥', '🎿', '⛷️', '🏔️'];

export const Composer: React.FC<ComposerProps> = ({ onSend, disabled }) => {
  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [showEmoji, setShowEmoji] = React.useState(false);
  
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const blobUrlsRef = React.useRef<Set<string>>(new Set());

  const canSend = (text.trim().length > 0 || pending.length > 0) && !isSending;

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!canSend || disabled) return;
    setIsSending(true);

    try {
      // Convert pending to attachments with thumbnails
      const attachments: MessageAttachment[] = await Promise.all(
        pending.map(async (p) => {
          let thumbUrl: string | undefined;
          
          try {
            if (p.type === 'image') {
              const thumbResult = await createThumbnail(p.file);
              thumbUrl = await mediaStorage.saveMedia(`${p.id}-thumb`, thumbResult.thumbBlob);
            } else if (p.type === 'video') {
              const thumbResult = await createVideoThumbnail(p.file);
              thumbUrl = await mediaStorage.saveMedia(`${p.id}-thumb`, thumbResult.thumbBlob);
            }
          } catch {
            // Thumbnail failed, continue without
          }
          
          const url = await mediaStorage.saveMedia(p.id, p.file);
          return { id: p.id, type: p.type, url, thumbUrl };
        })
      );

      onSend(text.trim(), attachments);
      setText('');
      
      // Cleanup preview URLs
      pending.forEach(p => {
        URL.revokeObjectURL(p.previewUrl);
        blobUrlsRef.current.delete(p.previewUrl);
      });
      setPending([]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: PendingAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) continue;

      const previewUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(previewUrl);

      newAttachments.push({
        id: crypto.randomUUID(),
        file,
        type: isVideo ? 'video' : 'image',
        previewUrl,
      });
    }

    setPending(prev => [...prev, ...newAttachments]);
    
    // Reset inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setPending(prev => {
      const item = prev.find(p => p.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        blobUrlsRef.current.delete(item.previewUrl);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="bg-background">
      {/* Attachment previews */}
      {pending.length > 0 && (
        <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
          {pending.map((p) => (
            <div key={p.id} className="relative flex-shrink-0">
              {p.type === 'video' ? (
                <video src={p.previewUrl} className="h-16 w-auto rounded-lg object-cover" muted />
              ) : (
                <img src={p.previewUrl} alt="" className="h-16 w-auto rounded-lg object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeAttachment(p.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick emoji picker */}
      {showEmoji && (
        <div className="flex gap-2 px-3 py-2 border-t border-border">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="text-2xl tap-target flex items-center justify-center"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Library button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSending}
          className="tap-target p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors disabled:opacity-50"
        >
          <Plus size={24} />
        </button>

        {/* Camera button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isSending}
          className="tap-target p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors disabled:opacity-50"
        >
          <Camera size={24} />
        </button>

        {/* Textarea - MUST be 16px to prevent iOS zoom */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv en melding..."
            disabled={disabled || isSending}
            rows={1}
            className={cn(
              "w-full resize-none bg-muted rounded-2xl px-4 py-2 pr-10",
              // CRITICAL: text-[16px] prevents iOS auto-zoom on focus
              "text-[16px] leading-5",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary",
              "disabled:opacity-50",
              "max-h-[120px] overflow-y-auto"
            )}
          />
          
          {/* Emoji toggle */}
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="absolute right-2 bottom-2 p-1 text-muted-foreground hover:text-foreground"
          >
            <Smile size={20} />
          </button>
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || disabled}
          className={cn(
            "tap-target p-2 rounded-full transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};
