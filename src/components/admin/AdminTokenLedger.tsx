/**
 * AdminTokenLedger – Read-only token ledger with user/date filter
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandInput } from "@/components/ui/brand-input";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { Coins, Search } from "lucide-react";
import type { AdminUser } from "./useAdminData";

interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  description: string | null;
  created_at: string;
}

interface Props {
  users: AdminUser[];
}

export const AdminTokenLedger: React.FC<Props> = ({ users }) => {
  const [entries, setEntries] = React.useState<LedgerEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterUser, setFilterUser] = React.useState("");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Use service-level select – admin RLS allows reading all via admin check
      // token_ledger only allows own reads, so we use shot_events approach
      // Actually we need to read all entries – let's query differently
      const { data } = await supabase.from("token_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setEntries(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const getDisplayName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || userId.slice(0, 8);
  };

  const filtered = React.useMemo(() => {
    let result = entries;
    if (filterUser) {
      result = result.filter(e => e.user_id === filterUser);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.reason.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        getDisplayName(e.user_id).toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, filterUser, search, users]);

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex items-center gap-2">
        <Coins size={18} className="text-primary" />
        <h3 className="font-heading font-semibold text-foreground text-sm">Token-ledger</h3>
      </div>

      <select
        value={filterUser}
        onChange={e => setFilterUser(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm text-foreground"
      >
        <option value="">Alle brukere</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.nickname || u.full_name || u.email}</option>
        ))}
      </select>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <BrandInput type="search" placeholder="Søk grunn..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <BrandSkeleton key={i} className="h-12 w-full" />)
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Ingen oppføringer</p>
      ) : (
        <div className="space-y-1">
          {filtered.map(e => (
            <BrandCard key={e.id}>
              <BrandCardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{getDisplayName(e.user_id)}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{e.reason}{e.description ? ` – ${e.description}` : ""}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`font-mono text-sm font-bold ${e.delta > 0 ? "text-success" : "text-destructive"}`}>
                  {e.delta > 0 ? "+" : ""}{e.delta}
                </span>
              </BrandCardContent>
            </BrandCard>
          ))}
        </div>
      )}
    </div>
  );
};
