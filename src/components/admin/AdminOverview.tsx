/**
 * AdminOverview – Quick stats + action buttons + share link + recent signups
 */
import * as React from "react";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandButton } from "@/components/ui/brand-button";
import {
  Users, Bell, BellOff, Zap, Link2, UserPlus, Check,
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

  // Recent signups (last 7 days)
  const recentSignups = React.useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return users
      .filter(u => new Date(u.created_at).getTime() > weekAgo)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [users]);

  // Signups today
  const todayCount = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return users.filter(u => new Date(u.created_at) >= todayStart).length;
  }, [users]);

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={Users} value={stats.activeUsers24h} label="Aktive (24t)" />
          <StatCard icon={UserPlus} value={todayCount} label="Nye i dag" />
          <StatCard
            icon={stats.pushOk ? Bell : BellOff}
            value={stats.pushOk ? "OK" : "Feil"}
            label="Push"
            accent={stats.pushOk}
          />
          {extendedStats && (
            <>
              <StatCard icon={MessageCircle} value={extendedStats.totalMessages} label="Meldinger" />
              <StatCard icon={BarChart3} value={extendedStats.activePolls} label="Polls aktive" />
              <StatCard icon={Image} value={extendedStats.galleryItems} label="Galleri" />
            </>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <BrandButton variant="outline" onClick={() => onNavigate("push")} className="h-12">
          <Bell size={16} className="mr-2" /> Push
        </BrandButton>
        <BrandButton variant="outline" onClick={() => onNavigate("moderate")} className="h-12">
          <BarChart3 size={16} className="mr-2" /> Moderering
        </BrandButton>
        <BrandButton variant="outline" onClick={() => onNavigate("bugs")} className="h-12">
          <MessageCircle size={16} className="mr-2" /> Feilrapporter
        </BrandButton>
        <BrandButton variant="outline" onClick={() => onNavigate("log")} className="h-12">
          <Zap size={16} className="mr-2" /> Logg
        </BrandButton>
      </div>


      {/* Share links */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Del lenke</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SHARE_LINKS.map((link, idx) => (
              <BrandButton
                key={link.path}
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-xs"
                onClick={() => copyLink(idx, link.path)}
              >
                {copiedIdx === idx ? <Check size={14} className="text-success" /> : <Link2 size={14} />}
                {link.label}
              </BrandButton>
            ))}
          </div>
        </BrandCardContent>
      </BrandCard>

      {/* Recent signups */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
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
                  <span className="text-foreground truncate flex-1">
                    {u.nickname || u.full_name || u.email}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {formatRelative(u.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BrandCardContent>
      </BrandCard>
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
  <BrandCard>
    <BrandCardContent className="p-3 text-center">
      <Icon size={14} className={`mx-auto mb-1 ${accent ? "text-success" : "text-muted-foreground"}`} />
      <p className="text-base font-bold font-mono text-foreground">{value}</p>
      <p className="text-[9px] text-muted-foreground leading-tight truncate">{label}</p>
    </BrandCardContent>
  </BrandCard>
);
