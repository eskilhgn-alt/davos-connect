/**
 * Composer - iMessage-style message input with reply preview and file attachments.
 */

import * as React from 'react';
import { Send, Camera, ImageIcon, X, Smile, Paperclip, Reply, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Attachment, ReplyPreview } from './types';
import { chatStore } from './store';
import { EmojiPicker } from './EmojiPicker';
import { GiphyPicker } from './GiphyPicker';
import { useAuth } from '@/contexts/AuthContext';
import { errorToast } from '@/utils/errorToast';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
const CHAT_DRAFT_KEY = 'guttahutte:chat-draft:main';
const MEDIA_MIME_ALLOW = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime))$/i;
const DOC_EXTENSION_ALLOW = /\.(pdf|doc|docx|xls|xlsx|zip|txt|csv)$/i;

interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void | Promise<void>;
  onHeightChange: (height: number) => void;
}

export const Composer: React.FC<ComposerProps> = ({ onSend, onHeightChange }) => {
  const [text, setText] = React.useState(() => {
    try { return localStorage.getItem(CHAT_DRAFT_KEY) || ''; } catch { return ''; }
  });
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [showTools, setShowTools] = React.useState(false);
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
  const attachmentsRef = React.useRef<Attachment[]>([]);
  const typingMeta = React.useMemo(() => user ? ({
    id: user.id,
    name: profile?.nickname || profile?.full_name || 'Noen',
  }) : null, [user, profile]);

  React.useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  React.useEffect(() => () => {
    for (const attachment of attachmentsRef.current) {
      if (attachment.objectUrl.startsWith('blob:')) URL.revokeObjectURL(attachment.objectUrl);
    }
  }, []);
  React.useEffect(() => () => {
    if (typingMeta) chatStore.setTyping(false, typingMeta);
  }, [typingMeta]);

  React.useEffect(() => {
    try {
      if (text) localStorage.setItem(CHAT_DRAFT_KEY, text);
      else localStorage.removeItem(CHAT_DRAFT_KEY);
    } catch { /* storage can be unavailable in private mode */ }
  }, [text]);

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
    if (typingMeta) chatStore.setTyping(e.target.value.length > 0, typingMeta);
  }, [typingMeta]);

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
    setShowTools(false);
    if (typingMeta) chatStore.setTyping(false, typingMeta);
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
    const slots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    for (let i = 0; i < files.length; i++) {
      if (newAttachments.length >= slots) break;
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        errorToast('Filen er for stor (maks 20 MB).');
        continue;
      }
      if (!MEDIA_MIME_ALLOW.test(file.type)) {
        errorToast('Denne bilde- eller videottypen støttes ikke.');
        continue;
      }
      newAttachments.push({
        id: crypto.randomUUID(),
        kind: file.type.startsWith('video/') ? 'video' : 'image',
        objectUrl: URL.createObjectURL(file),
        file,
      });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (files.length > slots) errorToast(`Maks ${MAX_ATTACHMENTS} vedlegg per melding.`);
  };

  // Handle generic file/PDF selection
  const handleDocs = (files: FileList | null) => {
    if (!files) return;
    const newAttachments: Attachment[] = [];
    const slots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    for (let i = 0; i < files.length; i++) {
      if (newAttachments.length >= slots) break;
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        errorToast('Filen er for stor (maks 20 MB).');
        continue;
      }
      if (!DOC_EXTENSION_ALLOW.test(file.name)) {
        errorToast('Denne filtypen støttes ikke.');
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
    if (files.length > slots) errorToast(`Maks ${MAX_ATTACHMENTS} vedlegg per melding.`);
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
        {/* Reply preview — appears exactly once, outside the attachment list */}
        {replyTo && (
          <div className="flex items-center gap-2 mx-3 my-2 px-3 py-2 rounded-lg bg-muted border-l-2 border-primary">
            <Reply size={14} className="text-muted-foreground flex-none" aria-hidden="true" />
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
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 px-3 pt-2 overflow-x-auto">
            {attachments.map((att) => {
              const isFile = att.kind === 'file';
              return (
                <div
                  key={att.id}
                  className={cn(
                    'relative flex-shrink-0',
                    isFile ? 'min-w-[180px]' : ''
                  )}
                >
                  {att.kind === 'video' && (
                    <video
                      src={att.objectUrl}
                      className="h-16 w-16 object-cover rounded-lg"
                    />
                  )}
                  {(att.kind === 'image' || att.kind === 'gif') && (
                    <img
                      src={att.objectUrl}
                      alt={att.filename || 'Vedlegg'}
                      className="h-16 w-16 object-cover rounded-lg"
                    />
                  )}
                  {isFile && (
                    <div className="flex items-center gap-2 h-16 px-3 rounded-lg bg-muted border border-border">
                      <Paperclip size={18} className="text-muted-foreground flex-none" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[140px]">
                          {att.filename || 'Fil'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {att.size ? `${Math.round(att.size / 1024)} KB` : ''}
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Fjern vedlegg"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Familiar one-line Messenger-style composer. */}
        <div className="flex items-end gap-1 px-2.5 pt-2 pb-1">
          <button
            type="button"
            aria-label={showTools ? 'Skjul flere valg' : 'Vis flere valg'}
            aria-expanded={showTools}
            onClick={() => setShowTools((value) => !value)}
            className="h-10 w-10 flex-none rounded-full text-primary flex items-center justify-center active:bg-muted"
          >
            <Plus size={23} className={cn('transition-transform duration-200', showTools && 'rotate-45')} />
          </button>

          <button
            type="button"
            aria-label="Ta bilde"
            onClick={() => cameraInputRef.current?.click()}
            className="h-10 w-10 flex-none rounded-full text-primary flex items-center justify-center active:bg-muted"
          >
            <Camera size={21} />
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ''; }}
          />

          <button
            type="button"
            aria-label="Legg til bilde eller video"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 flex-none rounded-full text-primary flex items-center justify-center active:bg-muted"
          >
            <ImageIcon size={21} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = ''; }}
          />

          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onBlur={() => { if (typingMeta) chatStore.setTyping(false, typingMeta); }}
              placeholder="Aa"
              rows={1}
              className={cn(
                'block w-full resize-none rounded-2xl border border-input bg-muted/60',
                'pl-3.5 pr-10 py-2.5 text-[16px] leading-[22px]',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'
              )}
              style={{ minHeight: '42px', maxHeight: '140px' }}
            />
            <button
              type="button"
              aria-label="Legg til emoji"
              onClick={() => setShowEmojiPicker(true)}
              className="absolute bottom-1 right-1 h-8 w-8 rounded-full text-muted-foreground flex items-center justify-center active:bg-background"
            >
              <Smile size={20} />
            </button>
          </div>

          <button
            type="button"
            aria-label="Send melding"
            onClick={handleSend}
            disabled={!canSend || sending}
            className={cn(
              'flex-none flex items-center justify-center rounded-full w-10 h-10 mb-[1px] transition-all active:scale-95',
              canSend ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            <Send size={20} />
          </button>
        </div>

        {showTools && (
          <div className="flex items-center gap-2 px-3 pb-2 pt-1 animate-in slide-in-from-bottom-1 duration-150">
            <button
              type="button"
              aria-label="Legg til fil"
              onClick={() => docInputRef.current?.click()}
              className="min-h-10 rounded-full bg-muted px-3 flex items-center gap-2 text-sm font-medium"
            >
              <Paperclip size={18} /> Fil
            </button>
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
              multiple
              className="hidden"
              onChange={(e) => { handleDocs(e.target.files); e.currentTarget.value = ''; }}
            />
          <button
            type="button"
            aria-label="Legg til GIF"
              onClick={() => setShowGiphyPicker(true)}
              className="min-h-10 rounded-full bg-muted px-3 text-sm font-semibold"
          >
            GIF
          </button>
          </div>
        )}
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
