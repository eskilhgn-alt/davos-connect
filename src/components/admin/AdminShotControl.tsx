/**
 * AdminShotControl – Active rounds, history, token adjustment, force actions
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  Target, Coins, RefreshCw, RotateCcw, Loader2, Plus, Minus, Ticket,
  AlertTriangle, ShieldOff,
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
  preselectedUserId,
}) => {
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [adjustUserId, setAdjustUserId] = React.useState<string | null>(preselectedUserId || null);
  const [adjustDelta, setAdjustDelta] = React.useState(0);
  const [adjustReason, setAdjustReason] = React.useState("");

  React.useEffect(() => {
    if (preselectedUserId) setAdjustUserId(preselectedUserId);
  }, [preselectedUserId]);

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
      // Resolve as confirmed (remove penalty)
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

  const adjustTokens = async () => {
    if (!adjustUserId || adjustDelta === 0 || !adjustReason.trim()) return;
    setActionLoading("adjust");
    try {
      const { error } = await supabase.rpc("rpc_admin_adjust_tokens", {
        p_user_id: adjustUserId,
        p_delta: adjustDelta,
        p_reason: adjustReason,
      });
      if (error) throw error;
      toast.success(`Tokens justert: ${adjustDelta > 0 ? "+" : ""}${adjustDelta}`);
      onLogAction(currentUserId, "token_adjust", adjustUserId, { delta: adjustDelta, reason: adjustReason });
      setAdjustUserId(null);
      setAdjustDelta(0);
      setAdjustReason("");
      onRefreshUsers();
    } catch (e: any) {
      errorToast("Feil ved justering", { description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const giveFrikort = async (userId: string) => {
    setActionLoading(`frikort-${userId}`);
    try {
      const { error } = await supabase.from("user_frikort").insert({
        user_id: userId,
        reason: "admin_granted",
      });
      if (error) throw error;
      toast.success("Frikort gitt");
      onLogAction(currentUserId, "frikort_granted", userId);
      onRefreshUsers();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const unbanShot = async (userId: string) => {
    setActionLoading(`unban-${userId}`);
    try {
      const { error } = await supabase.rpc("rpc_admin_unban_shot", { p_user_id: userId });
      if (error) throw error;
      toast.success("Utestengelse fjernet");
      onLogAction(currentUserId, "shot_unban", userId);
      onRefreshUsers();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  // Find banned users
  const bannedUsers = users.filter(u => u.is_active && (u as any).shot_banned_until && new Date((u as any).shot_banned_until) > new Date());

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Banned users */}
      {bannedUsers.length > 0 && (
        <DavosCard>
          <DavosCardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldOff size={18} className="text-destructive" />
              <h3 className="font-heading font-semibold text-foreground text-sm">Utestengte (Shot)</h3>
            </div>
            {bannedUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{u.nickname || u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Utestengt til {new Date((u as any).shot_banned_until).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <DavosButton variant="outline" size="sm" onClick={() => unbanShot(u.id)}
                  disabled={actionLoading === `unban-${u.id}`}>
                  {actionLoading === `unban-${u.id}` ? <Loader2 size={14} className="animate-spin" /> : "Fjern ban"}
                </DavosButton>
              </div>
            ))}
          </DavosCardContent>
        </DavosCard>
      )}
      {/* Token adjustment */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Juster tokens</h3>
          </div>
          <select
            value={adjustUserId || ""}
            onChange={e => setAdjustUserId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm text-foreground"
          >
            <option value="">Velg bruker...</option>
            {users.filter(u => u.is_active).map(u => (
              <option key={u.id} value={u.id}>
                {u.nickname || u.full_name || u.email} ({u.token_balance} tokens)
              </option>
            ))}
          </select>

          <div className="flex gap-2 items-center justify-center">
            <DavosButton variant="outline" size="sm" onClick={() => setAdjustDelta(d => d - 1)}><Minus size={16} /></DavosButton>
            <span className="font-mono text-lg font-bold text-foreground min-w-[48px] text-center">
              {adjustDelta > 0 ? "+" : ""}{adjustDelta}
            </span>
            <DavosButton variant="outline" size="sm" onClick={() => setAdjustDelta(d => d + 1)}><Plus size={16} /></DavosButton>
          </div>

          <DavosInput placeholder="Grunn..." value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />

          <DavosButton onClick={adjustTokens} disabled={!adjustUserId || adjustDelta === 0 || !adjustReason.trim() || actionLoading === "adjust"} className="w-full">
            {actionLoading === "adjust" ? <Loader2 size={14} className="animate-spin mr-2" /> : <Coins size={14} className="mr-2" />}
            Juster tokens
          </DavosButton>

          {adjustUserId && (
            <DavosButton variant="outline" size="sm" onClick={() => giveFrikort(adjustUserId)} disabled={!!actionLoading} className="w-full">
              {actionLoading === `frikort-${adjustUserId}` ? <Loader2 size={14} className="animate-spin mr-1" /> : <Ticket size={14} className="mr-1" />}
              Gi frikort
            </DavosButton>
          )}
        </DavosCardContent>
      </DavosCard>

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
