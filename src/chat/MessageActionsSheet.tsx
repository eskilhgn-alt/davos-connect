/**
 * MessageActionsSheet - Combined bottom sheet with:
 * 1. Quick reactions at top
 * 2. Seen-by list
 * 3. Actions (Copy, Reply, Edit, Delete)
 */

import * as React from 'react';
import { Pencil, Trash2, Copy, Eye, Loader2, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUICK_REACTIONS } from './emojiBank';
import { supabase } from '@/integrations/supabase/client';

interface SeenByEntry {
  userId: string;
  name: string;
  seenAt: string;
}

interface MessageActionsSheetProps {
  messageId: string;
  isOwn: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onReply?: () => void;
  onReact: (emoji: string) => void;
  onClose: () => void;
}

export const MessageActionsSheet: React.FC<MessageActionsSheetProps> = ({
  messageId,
  isOwn,
  onEdit,
  onDelete,
  onCopy,
  onReply,
  onReact,
  onClose,
}) => {
  const [seenBy, setSeenBy] = React.useState<SeenByEntry[]>([]);
  const [loadingSeenBy, setLoadingSeenBy] = React.useState(true);

  // Fetch seen-by on mount
  React.useEffect(() => {
    const fetchSeenBy = async () => {
      setLoadingSeenBy(true);
      try {
        const { data: reads, error } = await supabase
          .from("chat_reads")
          .select("user_id, read_at")
          .eq("message_id", messageId)
          .order("read_at", { ascending: false });

        if (error || !reads || reads.length === 0) {
          setSeenBy([]);
          setLoadingSeenBy(false);
          return;
        }

        // Fetch profile names separately
        const userIds = reads.map((r) => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nickname, full_name, email")
          .in("id", userIds);

        const profileMap = new Map<string, string>();
        for (const p of (profiles || []) as any[]) {
          profileMap.set(p.id, p.nickname || p.full_name || p.email || "Ukjent");
        }

        setSeenBy(
          reads.map((row) => ({
            userId: row.user_id,
            name: profileMap.get(row.user_id) || "Ukjent",
            seenAt: row.read_at,
          }))
        );
      } catch {
        // silent
      } finally {
        setLoadingSeenBy(false);
      }
    };
    fetchSeenBy();
  }, [messageId]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 1) return "Nå";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}t`;
    return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleReactAndClose = (emoji: string) => {
    onReact(emoji);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={handleBackdropClick}
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className={cn(
          'w-full max-w-lg bg-background rounded-t-2xl',
          'animate-in slide-in-from-bottom duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '70vh',
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Quick reactions */}
        <div className="flex items-center justify-center gap-1 px-4 py-3 border-b border-border">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReactAndClose(emoji)}
              className="w-11 h-11 flex items-center justify-center text-2xl rounded-full hover:bg-muted active:scale-110 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Seen-by section */}
        <div className="border-b border-border">
          <div className="flex items-center gap-2 px-4 py-2">
            <Eye size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sett av</span>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '120px' }}>
            {loadingSeenBy ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : seenBy.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Ingen har sett denne ennå</p>
            ) : (
              <div className="px-4 pb-2">
                {seenBy.map((entry) => (
                  <div key={entry.userId} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-foreground">{entry.name}</span>
                    <span className="text-[11px] text-muted-foreground">{formatTime(entry.seenAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="py-1">
          <button
            type="button"
            aria-label="Kopier melding"
            onClick={(e) => { e.stopPropagation(); onCopy(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted active:bg-muted/80 transition-colors"
          >
            <Copy size={20} />
            <span className="text-base">Kopier</span>
          </button>

          {onReply && (
            <button
              type="button"
              aria-label="Svar på melding"
              onClick={(e) => { e.stopPropagation(); onReply(); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted active:bg-muted/80 transition-colors"
            >
              <Reply size={20} />
              <span className="text-base">Svar</span>
            </button>
          )}

          {isOwn && onEdit && (
            <button
              type="button"
              aria-label="Rediger melding"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted active:bg-muted/80 transition-colors"
            >
              <Pencil size={20} />
              <span className="text-base">Rediger</span>
            </button>
          )}

          {isOwn && onDelete && (
            <button
              type="button"
              aria-label="Slett melding"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('Slett denne meldingen?')) onDelete();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted active:bg-muted/80 transition-colors text-destructive"
            >
              <Trash2 size={20} />
              <span className="text-base">Slett</span>
            </button>
          )}
        </div>

        {/* Close handle */}
        <div className="flex justify-center py-2">
          <button type="button" onClick={onClose} className="px-6 py-1.5 rounded-full bg-muted text-sm text-muted-foreground">
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
};
