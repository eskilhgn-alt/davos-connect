/**
 * AdminPushTools – Push status per user, broadcast, and recent push events
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandButton } from "@/components/ui/brand-button";
import { BrandInput } from "@/components/ui/brand-input";
import { BrandBadge } from "@/components/ui/brand-badge";
import { Bell, Send, Loader2, Megaphone, User } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminUser } from "./useAdminData";

interface PushToken {
  user_id: string;
  player_id: string;
}

interface Props {
  users: AdminUser[];
  currentUserId: string;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

export const AdminPushTools: React.FC<Props> = ({ users, currentUserId, onLogAction }) => {
  const [pushTokens, setPushTokens] = React.useState<PushToken[]>([]);
  const [broadcastMsg, setBroadcastMsg] = React.useState("");
  const [broadcastHeading, setBroadcastHeading] = React.useState("");
  const [loading, setLoading] = React.useState<string | null>(null);
  const [targetUserId, setTargetUserId] = React.useState("");
  const [directMsg, setDirectMsg] = React.useState("");

  React.useEffect(() => {
    // Admin can read push_tokens via service - but RLS only allows own tokens
    // We'll use the users list to show status and check who has tokens
    const load = async () => {
      const { data } = await supabase.from("push_tokens").select("user_id, player_id");
      setPushTokens(data || []);
    };
    load();
  }, []);

  const userPushStatus = React.useMemo(() => {
    const tokenMap = new Set(pushTokens.map(t => t.user_id));
    return users.map(u => ({
      ...u,
      hasPush: tokenMap.has(u.id),
    }));
  }, [users, pushTokens]);

  const sendPush = async (type: "broadcast" | "direct") => {
    setLoading(type);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Ikke autentisert");

      const heading = type === "broadcast" ? (broadcastHeading || "GüttaHütte 📢") : "Melding fra admin 📢";
      const message = type === "broadcast" ? broadcastMsg : directMsg;

      if (!message.trim()) throw new Error("Skriv en melding");

      const body: any = {
        type: type === "broadcast" ? "broadcast" : "admin_notification",
        heading,
        message,
      };

      if (type === "direct" && targetUserId) {
        body.include_user_ids = [targetUserId];
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Push feilet");

      toast.success(`Push sendt til ${result.sent} bruker(e)`);
      onLogAction(currentUserId, type === "broadcast" ? "broadcast_push" : "direct_push",
        type === "direct" ? targetUserId : undefined,
        { message, sent: result.sent });

      if (type === "broadcast") { setBroadcastMsg(""); setBroadcastHeading(""); }
      else { setDirectMsg(""); setTargetUserId(""); }
    } catch (e: any) {
      errorToast("Feil ved push", { description: e.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Broadcast */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Broadcast til alle</h3>
          </div>
          <BrandInput placeholder="Overskrift (valgfritt)" value={broadcastHeading} onChange={e => setBroadcastHeading(e.target.value)} />
          <BrandInput placeholder="Melding..." value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} />
          <BrandButton onClick={() => sendPush("broadcast")} disabled={!broadcastMsg.trim() || loading === "broadcast"} className="w-full">
            {loading === "broadcast" ? <Loader2 size={14} className="animate-spin mr-2" /> : <Send size={14} className="mr-2" />}
            Send til alle
          </BrandButton>
        </BrandCardContent>
      </BrandCard>

      {/* Direct push */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Direkte push</h3>
          </div>
          <select
            value={targetUserId}
            onChange={e => setTargetUserId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm text-foreground"
          >
            <option value="">Velg bruker...</option>
            {users.filter(u => u.is_active).map(u => (
              <option key={u.id} value={u.id}>{u.nickname || u.full_name || u.email}</option>
            ))}
          </select>
          <BrandInput placeholder="Melding..." value={directMsg} onChange={e => setDirectMsg(e.target.value)} />
          <BrandButton onClick={() => sendPush("direct")} disabled={!targetUserId || !directMsg.trim() || loading === "direct"} className="w-full">
            {loading === "direct" ? <Loader2 size={14} className="animate-spin mr-2" /> : <Bell size={14} className="mr-2" />}
            Send til bruker
          </BrandButton>
        </BrandCardContent>
      </BrandCard>

      {/* Push status per user */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-2">
          <h3 className="font-heading font-semibold text-foreground text-sm">Push-status</h3>
          {userPushStatus.map(u => (
            <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <span className="text-xs text-foreground truncate">{u.nickname || u.full_name || u.email}</span>
              <BrandBadge variant={u.hasPush ? "accent" : "default"}>
                {u.hasPush ? "Aktiv" : "Ingen"}
              </BrandBadge>
            </div>
          ))}
        </BrandCardContent>
      </BrandCard>
    </div>
  );
};
