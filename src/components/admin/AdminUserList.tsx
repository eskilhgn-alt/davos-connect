/**
 * AdminUserList – Searchable user list with expanded detail panels
 */
import * as React from "react";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { AdminUserDetail } from "./AdminUserDetail";
import { RefreshCw, Search } from "lucide-react";
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

  const filtered = React.useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.nickname?.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="px-4 space-y-3 pb-6">
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
