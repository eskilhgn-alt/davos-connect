import * as React from 'react';
import { Send, Plus, X, Image as ImageIcon, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import type { MessageAttachment } from '@/services/contracts';
import { mediaStorage } from '@/services/media-storage';
import { createThumbnail, createVideoThumbnail } from '@/utils/imageThumb';

interface ChatComposerProps {
  onSend: (text: string, attachments: MessageAttachment[]) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  className?: string;
}

interface PendingAttachment {
  id: string;
  file: File;
  type: 'image' | 'video';
  previewUrl: string; // Blob URL for immediate preview
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onTyping,
  disabled = false,
  className,
}) => {
  const [text, setText] = React.useState('');
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const lastTextRef = React.useRef('');
  // Track blob URLs for cleanup
  const blobUrlsRef = React.useRef<Set<string>>(new Set());

  const canSend = (text.trim().length > 0 || pendingAttachments.length > 0) && !isSending;

  // Cleanup blob URLs on unmount
  React.useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
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

  // Notify typing with proper isTyping boolean
  React.useEffect(() => {
    if (!onTyping) return;
    
    const wasTyping = lastTextRef.current.length > 0;
    const isTyping = text.length > 0;
    
    // Only notify on change
    if (isTyping !== wasTyping) {
      onTyping(isTyping);
    } else if (isTyping && text !== lastTextRef.current) {
      // Still typing, notify to reset debounce
      onTyping(true);
    }
    
    lastTextRef.current = text;
  }, [text, onTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!canSend || disabled) return;

    setIsSending(true);

    // Notify stop typing
    onTyping?.(false);

    try {
      // Convert pending attachments to final attachments with thumbnails
      const attachments: MessageAttachment[] = await Promise.all(
        pendingAttachments.map(async (pending) => {
          try {
            // Create thumbnail for images/videos
            let thumbUrl: string | undefined;
            
            if (pending.type === 'image') {
              const thumbResult = await createThumbnail(pending.file);
              const thumbId = `${pending.id}-thumb`;
              thumbUrl = await mediaStorage.saveMedia(thumbId, thumbResult.thumbBlob);
            } else if (pending.type === 'video') {
              try {
                const thumbResult = await createVideoThumbnail(pending.file);
                const thumbId = `${pending.id}-thumb`;
                thumbUrl = await mediaStorage.saveMedia(thumbId, thumbResult.thumbBlob);
              } catch {
                // Video thumbnail failed, continue without
              }
            }
            
            // Save original to IndexedDB
            const url = await mediaStorage.saveMedia(pending.id, pending.file);
            
            return {
              id: pending.id,
              type: pending.type,
              url,
              thumbUrl,
            };
          } catch {
            // Fallback if thumbnail creation fails
            const url = await mediaStorage.saveMedia(pending.id, pending.file);
            return {
              id: pending.id,
              type: pending.type,
              url,
            };
          }
        })
      );

      onSend(text.trim(), attachments);
      setText('');
      
      // Revoke preview blob URLs after sending
      pendingAttachments.forEach(p => {
        URL.revokeObjectURL(p.previewUrl);
        blobUrlsRef.current.delete(p.previewUrl);
      });
      setPendingAttachments([]);
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

    setPendingAttachments(prev => [...prev, ...newAttachments]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const handleGifSelect = (gifUrl: string) => {
    // GIFs are remote URLs, send immediately
    onSend('', [{
      id: crypto.randomUUID(),
      type: 'gif',
      url: gifUrl,
    }]);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const attachment = prev.find(p => p.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
        blobUrlsRef.current.delete(attachment.previewUrl);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  return (
    <div className={cn("bg-background border-t border-border", className)}>
      {/* Attachment previews - using immediate blob URLs */}
      {pendingAttachments.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto">
          {pendingAttachments.map((attachment) => (
            <div key={attachment.id} className="relative flex-shrink-0">
              {attachment.type === 'video' ? (
                <video
                  src={attachment.previewUrl}
                  className="h-20 w-auto rounded-lg object-cover"
                  muted
                />
              ) : (
                <img
                  src={attachment.previewUrl}
                  alt="Vedlegg"
                  className="h-20 w-auto rounded-lg object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* File input for library (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {/* Camera input (hidden) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Attachment button (library) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isSending}
          className="tap-target p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          title="Velg fra bibliotek"
        >
          <Plus size={24} />
        </button>

        {/* Camera button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isSending}
          className="tap-target p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          title="Ta bilde"
        >
          <Camera size={24} />
        </button>

        {/* GIF button */}
        <GifPicker onSelect={handleGifSelect}>
          <button
            type="button"
            disabled={disabled || isSending}
            className="tap-target p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors disabled:opacity-50"
          >
            <ImageIcon size={24} />
          </button>
        </GifPicker>

        {/* Textarea */}
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
              "w-full resize-none bg-muted rounded-2xl px-4 py-2 pr-10 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "max-h-[120px] overflow-y-auto"
            )}
          />
          
          {/* Emoji picker inside textarea */}
          <div className="absolute right-2 bottom-1.5">
            <EmojiPicker onSelect={handleEmojiSelect} />
          </div>
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
