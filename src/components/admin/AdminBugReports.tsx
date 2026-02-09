/**
 * AdminBugReports – View bug reports from users
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Bug, RefreshCw } from "lucide-react";
import type { AdminUser } from "./useAdminData";

interface Props {
  users: AdminUser[];
}

interface BugReport {
  id: string;
  user_id: string;
  message: string;
  page_url: string | null;
  user_agent: string | null;
  created_at: string;
}

export const AdminBugReports: React.FC<Props> = ({ users }) => {
  const [reports, setReports] = React.useState<BugReport[]>([]);
  const [loading, setLoading] = React.useState(true);

  const getDisplayName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || "Ukjent";
  };

  const fetchReports = React.useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bug_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setReports((data as BugReport[]) || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { fetchReports(); }, [fetchReports]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("no-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-foreground text-sm flex items-center gap-2">
          <Bug size={16} className="text-primary" /> Feilrapporter
        </h3>
        <DavosButton variant="ghost" size="sm" onClick={fetchReports}>
          <RefreshCw size={14} />
        </DavosButton>
      </div>

      {loading ? (
        <div className="space-y-2">
          <DavosSkeleton className="h-16 w-full" />
          <DavosSkeleton className="h-16 w-full" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Ingen feilrapporter ennå 🎉</p>
      ) : (
        reports.map(r => (
          <DavosCard key={r.id}>
            <DavosCardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{getDisplayName(r.user_id)}</span>
                <span className="text-[10px] text-muted-foreground">{formatTime(r.created_at)}</span>
              </div>
              <p className="text-sm text-foreground">{r.message}</p>
              {r.page_url && (
                <p className="text-[10px] text-muted-foreground truncate">{r.page_url}</p>
              )}
            </DavosCardContent>
          </DavosCard>
        ))
      )}
    </div>
  );
};
