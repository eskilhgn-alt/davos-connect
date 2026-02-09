/**
 * SeenBySheet - Bottom sheet showing who has seen a message
 * Fetches from chat_reads table in Supabase
 */

import * as React from "react";
import { X, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SeenByEntry {
  userId: string;
  name: string;
  seenAt: string;
}

interface SeenBySheetProps {
  messageId: string;
  onClose: () => void;
}

export const SeenBySheet: React.FC<SeenBySheetProps> = ({ messageId, onClose }) => {
  const [seenBy, setSeenBy] = React.useState<SeenByEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchSeenBy = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("chat_reads")
          .select(`
            user_id,
            read_at,
            profiles:user_id (
              nickname,
              full_name,
              email
            )
          `)
          .eq("message_id", messageId)
          .order("read_at", { ascending: false });

        if (error) {
          console.error("Error fetching seen by:", error);
          setSeenBy([]);
          return;
        }

        const entries: SeenByEntry[] = (data || []).map((row: Record<string, unknown>) => {
          const profile = row.profiles as { nickname?: string; full_name?: string; email?: string } | null;
          return {
            userId: row.user_id as string,
            name: profile?.nickname || profile?.full_name || profile?.email || "Ukjent",
            seenAt: row.read_at as string,
          };
        });

        setSeenBy(entries);
      } catch (err) {
        console.error("Seen by fetch error:", err);
        setSeenBy([]);
      } finally {
        setIsLoading(false);
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
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Akkurat nå";
    if (diffMins < 60) return `${diffMins} min siden`;
    if (diffHours < 24) return `${diffHours} t siden`;
    if (diffDays < 7) return `${diffDays} d siden`;

    return date.toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={handleBackdropClick}
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
    >
      <div
        className={cn(
          "w-full max-w-lg bg-background rounded-t-2xl",
          "animate-in slide-in-from-bottom duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          maxHeight: "60vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-muted-foreground" />
            <span className="font-medium text-foreground">Sett av</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 60px)" }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : seenBy.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Eye size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Ingen har sett denne ennå</p>
            </div>
          ) : (
            <div className="py-2">
              {seenBy.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-foreground">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(entry.seenAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};