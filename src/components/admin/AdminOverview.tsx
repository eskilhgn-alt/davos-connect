/**
 * AdminOverview – Quick stats + action buttons for admin dashboard
 */
import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import {
  Users, Target, Bell, BellOff, Send, Mail, Loader2, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AdminStats } from "./useAdminData";

interface Props {
  stats: AdminStats | null;
  currentUserId: string;
  onNavigate: (tab: string) => void;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

export const AdminOverview: React.FC<Props> = ({ stats, currentUserId, onNavigate, onLogAction }) => {
  const [testPushLoading, setTestPushLoading] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteSending, setInviteSending] = React.useState(false);

  const sendTestPush = async () => {
    setTestPushLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Ikke autentisert");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "test",
          heading: "Test-push ✅",
          message: "Push-systemet fungerer!",
          include_user_ids: [currentUserId],
        }),
      });
      if (!res.ok) throw new Error("Push feilet");
      toast.success("Test-push sendt!");
      onLogAction(currentUserId, "test_push_sent");
    } catch {
      toast.error("Kunne ikke sende test-push");
    } finally {
      setTestPushLoading(false);
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      const res = await supabase.functions.invoke("send-invite", {
        body: { email: inviteEmail.trim() },
      });
      if (res.error) throw res.error;
      toast.success(`Invitasjon sendt til ${inviteEmail}`);
      onLogAction(currentUserId, "invite_sent", undefined, { email: inviteEmail });
      setInviteEmail("");
    } catch {
      toast.error("Kunne ikke sende invitasjon");
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={Users} value={stats.activeUsers24h} label="Aktive (24t)" />
          <StatCard icon={Target} value={stats.shotRounds24h} label="Shot (24t)" />
          <StatCard
            icon={stats.pushOk ? Bell : BellOff}
            value={stats.pushOk ? "OK" : "Feil"}
            label="Push-status"
            accent={stats.pushOk}
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <DavosButton variant="outline" onClick={sendTestPush} disabled={testPushLoading} className="h-12">
          {testPushLoading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Bell size={16} className="mr-2" />}
          Send test-push
        </DavosButton>
        <DavosButton variant="outline" onClick={() => onNavigate("shot")} className="h-12">
          <Zap size={16} className="mr-2" /> Siste hendelser
        </DavosButton>
      </div>

      {/* Invite */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Send invitasjon</h3>
          </div>
          <div className="flex gap-2">
            <DavosInput type="email" placeholder="E-post" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="flex-1" />
            <DavosButton onClick={sendInvite} disabled={inviteSending || !inviteEmail.trim()} size="sm">
              {inviteSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </DavosButton>
          </div>
        </DavosCardContent>
      </DavosCard>
    </div>
  );
};

const StatCard: React.FC<{ icon: any; value: string | number; label: string; accent?: boolean }> = ({ icon: Icon, value, label, accent }) => (
  <DavosCard>
    <DavosCardContent className="p-3 text-center">
      <Icon size={16} className={`mx-auto mb-1 ${accent ? "text-success" : "text-muted-foreground"}`} />
      <p className="text-lg font-bold font-mono text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </DavosCardContent>
  </DavosCard>
);
