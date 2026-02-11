/**
 * AdminUserList – Searchable user list with ban overview and expanded detail panels
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosBadge } from "@/components/ui/davos-badge";
import { AdminUserDetail } from "./AdminUserDetail";
import { RefreshCw, Search, ShieldOff, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminUser } from "./useAdminData";

interface Props {
  users: AdminUser[];
  loading: boolean;
  currentUserId: string;
  onRefresh: () => void;
  onAdjustTokens: (userId: string) => void;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

export const AdminUserList: React.FC<Props> = ({ users, loading, currentUserId, onRefresh, onAdjustTokens, onLogAction }) => {
  const [search, setSearch] = React.useState("");
  const [unbanLoading, setUnbanLoading] = React.useState<string | null>(null);

  const bannedUsers = React.useMemo(() => users.filter(u => u.is_banned), [users]);
  const shotBannedUsers = React.useMemo(() => {
    // Users with active shot bans (from shot_tokens)
    return []; // We'd need shot_tokens data; for now just show profile bans
  }, []);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.nickname?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleUnban = async (userId: string) => {
    setUnbanLoading(userId);
    try {
      const { error } = await supabase.rpc("rpc_admin_set_ban", {
        p_user_id: userId,
        p_banned: false,
      } as any);
      if (error) throw error;
      toast.success("Ban opphevet");
      onLogAction(currentUserId, "user_unbanned", userId);
      onRefresh();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally {
      setUnbanLoading(null);
    }
  };

  return (
    <div className="px-4 space-y-3 pb-6">
      {/* Banned users section */}
      {bannedUsers.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-2 text-destructive">
            <ShieldOff size={14} /> Utestengte brukere ({bannedUsers.length})
          </h3>
          {bannedUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{u.nickname || u.full_name || u.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  {u.ban_reason || "Ingen grunn oppgitt"}
                  {u.banned_at && ` · ${new Date(u.banned_at).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                </p>
              </div>
              <DavosButton
                variant="outline"
                size="sm"
                onClick={() => handleUnban(u.id)}
                disabled={unbanLoading === u.id}
              >
                {unbanLoading === u.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                Opphev
              </DavosButton>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <DavosInput
            type="search"
            placeholder="Søk navn, e-post..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DavosButton variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </DavosButton>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} brukere</p>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <DavosSkeleton key={i} className="h-20 w-full" />)
      ) : (
        filtered.map(u => (
          <AdminUserDetail
            key={u.id}
            user={u}
            currentUserId={currentUserId}
            onRefresh={onRefresh}
            onAdjustTokens={onAdjustTokens}
            onLogAction={onLogAction}
          />
        ))
      )}
    </div>
  );
};
