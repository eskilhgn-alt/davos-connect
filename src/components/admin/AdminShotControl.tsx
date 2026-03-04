/**
 * AdminShotControl – Active rounds, history, force actions (token-free)
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  Target, RefreshCw, RotateCcw, Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminUser } from "./useAdminData";

interface Props {
  users: AdminUser[];
  activeShots: any[];
  shotHistory: any[];
  corrections: any[];
  currentUserId: string;
  getDisplayName: (id: string) => string;
  onRefreshShots: () => void;
  onRefreshUsers: () => void;
  onRefreshCorrections: () => void;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
  preselectedUserId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  countdown: "⏳ Nedtelling",
  selected: "🎯 Trukket",
  confirmed: "✅ Bekreftet",
  punished: "💀 Straff",
  cancelled: "❌ Kansellert",
  disputed: "⚠️ Omstridt",
  overdue: "⏰ Forfalt",
};

export const AdminShotControl: React.FC<Props> = ({
  users, activeShots, shotHistory, corrections, currentUserId,
  getDisplayName, onRefreshShots, onRefreshUsers, onRefreshCorrections, onLogAction,
}) => {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const resetShotEvent = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      const { error } = await supabase.rpc("rpc_admin_reset_shot_event", { p_event_id: eventId });
      if (error) throw error;
      toast.success("Runde resatt");
      onLogAction(currentUserId, "shot_reset", undefined, { event_id: eventId });
      onRefreshShots();
    } catch (e: any) {
      errorToast("Feil ved reset", { description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const removePenalty = async (eventId: string) => {
    setActionLoading(`penalty-${eventId}`);
    try {
      const { error } = await supabase.rpc("rpc_confirm_shot", {
        p_event_id: eventId,
        p_mode: "admin_resolve",
        p_dispute_reason: "confirm",
      });
      if (error) throw error;
      toast.success("Straff fjernet – runde bekreftet");
      onLogAction(currentUserId, "penalty_removed", undefined, { event_id: eventId });
      onRefreshShots();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Active rounds */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-primary" />
              <h3 className="font-heading font-semibold text-foreground text-sm">Aktive runder</h3>
            </div>
            <DavosButton variant="ghost" size="sm" onClick={onRefreshShots}><RefreshCw size={14} /></DavosButton>
          </div>

          {activeShots.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Ingen aktive runder</p>
          ) : (
            activeShots.map(e => (
              <div key={e.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <DavosBadge variant={e.status === "disputed" ? "critical" : "default"}>
                      {STATUS_LABELS[e.status] || e.status}
                    </DavosBadge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.selected_user_id ? getDisplayName(e.selected_user_id) : "Nedtelling..."}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Startet av: {getDisplayName(e.started_by)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {e.status === "punished" && (
                      <DavosButton variant="outline" size="sm" onClick={() => removePenalty(e.id)}
                        disabled={actionLoading === `penalty-${e.id}`}
                        title="Fjern straff"
                      >
                        {actionLoading === `penalty-${e.id}` ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                      </DavosButton>
                    )}
                    <DavosButton variant="outline" size="sm" onClick={() => resetShotEvent(e.id)}
                      disabled={actionLoading === e.id}
                      title="Reset runde"
                    >
                      {actionLoading === e.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    </DavosButton>
                  </div>
                </div>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>

      {/* History */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-2">
          <h3 className="font-heading font-semibold text-foreground text-sm">Historikk (24t)</h3>
          {shotHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Ingen runder siste 24t</p>
          ) : (
            shotHistory.slice(0, 15).map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-xs text-foreground ml-2">
                    {e.selected_user_id ? getDisplayName(e.selected_user_id) : "—"}
                  </span>
                </div>
                <DavosBadge variant={e.status === "confirmed" ? "accent" : e.status === "punished" ? "critical" : "default"}>
                  {STATUS_LABELS[e.status] || e.status}
                </DavosBadge>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>
    </div>
  );
};