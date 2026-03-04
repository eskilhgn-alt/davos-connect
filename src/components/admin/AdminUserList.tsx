/**
 * AdminUserList – Searchable user list with ban overview and expanded detail panels
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosBadge } from "@/components/ui/davos-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminUserDetail } from "./AdminUserDetail";
import { RefreshCw, Search, ShieldOff, UserCheck, Loader2, CheckSquare, Bell, UserX, Trash2 } from "lucide-react";
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
  const [bulkMode, setBulkMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = React.useState(false);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((u) => u.id)));
    }
  };

  const bulkBan = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    for (const uid of selected) {
      if (uid === currentUserId) continue;
      await supabase.rpc("rpc_admin_set_ban", { p_user_id: uid, p_banned: true, p_reason: "Massehandling" } as any);
      onLogAction(currentUserId, "user_banned", uid);
    }
    toast.success(`${selected.size} brukere utestengt`);
    setSelected(new Set());
    setBulkMode(false);
    setBulkLoading(false);
    onRefresh();
  };

  const bulkPush = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Ikke autentisert");
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "admin_notification",
          heading: "Melding fra admin 📢",
          message: "Sjekk appen for oppdateringer.",
          include_user_ids: Array.from(selected),
        }),
      });
      toast.success(`Push sendt til ${selected.size} brukere`);
    } catch {
      errorToast("Kunne ikke sende push");
    }
    setBulkLoading(false);
  };

  const bannedUsers = React.useMemo(() => users.filter(u => u.is_banned), [users]);
  const unverifiedUsers = React.useMemo(() => users.filter(u => !u.email_verified), [users]);
  const [verifyLoading, setVerifyLoading] = React.useState<string | null>(null);

  const handleVerify = async (userId: string) => {
    setVerifyLoading(userId);
    try {
      const { error } = await supabase.from("profiles").update({ email_verified: true }).eq("id", userId);
      if (error) throw error;
      toast.success("E-post verifisert");
      onLogAction(currentUserId, "email_manually_verified", userId);
      onRefresh();
    } catch (e: any) {
      errorToast("Kunne ikke verifisere", { description: e.message });
    } finally {
      setVerifyLoading(null);
    }
  };

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

      {/* Unverified users section */}
      {unverifiedUsers.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-2 text-amber-600">
            <UserX size={14} /> Uverifiserte brukere ({unverifiedUsers.length})
          </h3>
          {unverifiedUsers.map(u => (
            <div key={u.id} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{u.nickname || u.full_name || u.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  Registrert {new Date(u.created_at).toLocaleDateString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <DavosButton
                variant="outline"
                size="sm"
                onClick={() => handleVerify(u.id)}
                disabled={verifyLoading === u.id}
                className="border-green-500/30 text-green-600 hover:bg-green-500/10"
              >
                {verifyLoading === u.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                Verifiser
              </DavosButton>
            </div>
          ))}
        </div>
      )}

      {/* Search + bulk toggle */}
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
        <DavosButton
          variant={bulkMode ? "primary" : "outline"}
          size="sm"
          onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}
        >
          <CheckSquare size={16} />
        </DavosButton>
        <DavosButton variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </DavosButton>
      </div>

      {/* Bulk actions bar */}
      {bulkMode && (
        <div className="flex items-center gap-2 flex-wrap">
          <DavosButton variant="outline" size="sm" onClick={selectAll}>
            {selected.size === filtered.length ? "Fjern alle" : "Velg alle"}
          </DavosButton>
          <span className="text-xs text-muted-foreground">{selected.size} valgt</span>
          <div className="flex-1" />
          <DavosButton variant="outline" size="sm" onClick={bulkPush} disabled={selected.size === 0 || bulkLoading}>
            <Bell size={14} className="mr-1" /> Push
          </DavosButton>
          <DavosButton variant="outline" size="sm" onClick={bulkBan} disabled={selected.size === 0 || bulkLoading}
            className="border-destructive/30 text-destructive">
            <ShieldOff size={14} className="mr-1" /> Utesteng
          </DavosButton>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{filtered.length} brukere</p>

      {loading ? (
        Array.from({ length: 4 }).map((_, i) => <DavosSkeleton key={i} className="h-20 w-full" />)
      ) : (
        filtered.map(u => (
          <div key={u.id} className="flex items-start gap-2">
            {bulkMode && (
              <Checkbox
                checked={selected.has(u.id)}
                onCheckedChange={() => toggleSelect(u.id)}
                className="mt-4"
                disabled={u.id === currentUserId}
              />
            )}
            <div className="flex-1 min-w-0">
              <AdminUserDetail
                user={u}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
                onLogAction={onLogAction}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
};
