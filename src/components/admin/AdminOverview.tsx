/**
 * AdminOverview – Quick stats + action buttons + share link + recent signups
 * Cleaned: removed points, streaks, tokens references
 */
import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import {
  Users, Target, Bell, BellOff, Loader2, Zap, Link2, UserPlus, Check,
  MessageCircle, BarChart3, Image,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminStats, AdminUser } from "./useAdminData";

interface Props {
  stats: AdminStats | null;
  users: AdminUser[];
  currentUserId: string;
  onNavigate: (tab: string) => void;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

const APP_URL = "https://guttahutte.lovable.app";

const SHARE_LINKS = [
  { label: "Registrering", path: "/auth" },
  { label: "Hjem", path: "/hjem" },
  { label: "Chat", path: "/chat" },
  { label: "Vær", path: "/vaer" },
];

export const AdminOverview: React.FC<Props> = ({ stats, users, currentUserId, onNavigate, onLogAction }) => {
  const [testPushLoading, setTestPushLoading] = React.useState(false);
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const [extendedStats, setExtendedStats] = React.useState<{
    totalMessages: number;
    activePolls: number;
    galleryItems: number;
  } | null>(null);

  React.useEffect(() => {
    const load = async () => {
      const [msgRes, pollsRes, galleryRes] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("polls").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("gallery_items").select("id", { count: "exact", head: true }),
      ]);
      setExtendedStats({
        totalMessages: msgRes.count ?? 0,
        activePolls: pollsRes.count ?? 0,
        galleryItems: galleryRes.count ?? 0,
      });
    };
    if (users.length > 0) load();
  }, [users]);

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
      errorToast("Kunne ikke sende test-push");
    } finally {
      setTestPushLoading(false);
    }
  };

  const copyLink = async (idx: number, path: string) => {
    try {
      await navigator.clipboard.writeText(`${APP_URL}${path}`);
      setCopiedIdx(idx);
      toast.success("Lenke kopiert!");
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      errorToast("Kunne ikke kopiere");
    }
  };

  const recentSignups = React.useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return users
      .filter(u => new Date(u.created_at).getTime() > weekAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [users]);

  const todayCount = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return users.filter(u => new Date(u.created_at) >= todayStart).length;
  }, [users]);

  return (
    <div className="px-4 space-y-4 pb-6">
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={Users} value={stats.activeUsers24h} label="Aktive (24t)" />
          <StatCard icon={Target} value={stats.shotRounds24h} label="Shot (24t)" />
          <StatCard icon={UserPlus} value={todayCount} label="Nye i dag" />
          <StatCard icon={stats.pushOk ? Bell : BellOff} value={stats.pushOk ? "OK" : "Feil"} label="Push" accent={stats.pushOk} />
          {extendedStats && (
            <>
              <StatCard icon={MessageCircle} value={extendedStats.totalMessages} label="Meldinger" />
              <StatCard icon={BarChart3} value={extendedStats.activePolls} label="Polls aktive" />
              <StatCard icon={Image} value={extendedStats.galleryItems} label="Galleri" />
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <DavosButton variant="outline" onClick={sendTestPush} disabled={testPushLoading} className="h-12">
          {testPushLoading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Bell size={16} className="mr-2" />}
          Send test-push
        </DavosButton>
        <DavosButton variant="outline" onClick={() => onNavigate("shot")} className="h-12">
          <Zap size={16} className="mr-2" /> Siste hendelser
        </DavosButton>
        <DavosButton variant="outline" onClick={() => onNavigate("moderate")} className="h-12">
          <BarChart3 size={16} className="mr-2" /> Moderering
        </DavosButton>
        <DavosButton variant="outline" onClick={() => onNavigate("bugs")} className="h-12">
          <MessageCircle size={16} className="mr-2" /> Feilrapporter
        </DavosButton>
      </div>

      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Del lenke</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SHARE_LINKS.map((link, idx) => (
              <DavosButton key={link.path} variant="outline" size="sm" className="justify-start gap-2 text-xs" onClick={() => copyLink(idx, link.path)}>
                {copiedIdx === idx ? <Check size={14} className="text-success" /> : <Link2 size={14} />}
                {link.label}
              </DavosButton>
            ))}
          </div>
        </DavosCardContent>
      </DavosCard>

      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              <h3 className="font-heading font-semibold text-foreground text-sm">Siste registreringer</h3>
            </div>
            <span className="text-xs text-muted-foreground">{users.length} totalt</span>
          </div>
          {recentSignups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen nye siste 7 dager</p>
          ) : (
            <div className="space-y-2">
              {recentSignups.slice(0, 8).map(u => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1">{u.nickname || u.full_name || u.email}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{formatRelative(u.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </DavosCardContent>
      </DavosCard>
    </div>
  );
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  return `${days}d siden`;
}

const StatCard: React.FC<{ icon: any; value: string | number; label: string; accent?: boolean }> = ({ icon: Icon, value, label, accent }) => (
  <DavosCard>
    <DavosCardContent className="p-3 text-center">
      <Icon size={14} className={`mx-auto mb-1 ${accent ? "text-success" : "text-muted-foreground"}`} />
      <p className="text-base font-bold font-mono text-foreground">{value}</p>
      <p className="text-[9px] text-muted-foreground leading-tight truncate">{label}</p>
    </DavosCardContent>
  </DavosCard>
);