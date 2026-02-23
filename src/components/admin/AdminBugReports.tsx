/**
 * AdminBugReports – View, copy, and delete bug reports
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Bug, RefreshCw, Copy, Trash2, ChevronDown, ChevronUp, Check } from "lucide-react";
import { toast } from "sonner";
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

export const AdminBugReports = React.forwardRef<HTMLDivElement, Props>(({ users }, ref) => {
  const [reports, setReports] = React.useState<BugReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

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

  const copyReport = async (r: BugReport) => {
    const text = [
      `🐛 Feilrapport`,
      `Fra: ${getDisplayName(r.user_id)}`,
      `Tid: ${formatTime(r.created_at)}`,
      `Melding: ${r.message}`,
      r.page_url ? `Side: ${r.page_url}` : null,
      r.user_agent ? `UA: ${r.user_agent}` : null,
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(r.id);
      toast.success("Kopiert til utklippstavle");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for iOS
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(r.id);
      toast.success("Kopiert");
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const deleteReport = async (id: string) => {
    await supabase.from("bug_reports").delete().eq("id", id);
    setReports(prev => prev.filter(r => r.id !== id));
    toast.success("Rapport slettet");
  };

  const deleteAll = async () => {
    if (!confirm("Slett alle feilrapporter?")) return;
    const ids = reports.map(r => r.id);
    for (const id of ids) {
      await supabase.from("bug_reports").delete().eq("id", id);
    }
    setReports([]);
    toast.success("Alle rapporter slettet");
  };

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-foreground text-sm flex items-center gap-2">
          <Bug size={16} className="text-primary" /> Feilrapporter ({reports.length})
        </h3>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <DavosButton variant="ghost" size="sm" onClick={deleteAll} className="text-destructive">
              <Trash2 size={14} />
            </DavosButton>
          )}
          <DavosButton variant="ghost" size="sm" onClick={fetchReports}>
            <RefreshCw size={14} />
          </DavosButton>
        </div>
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
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{getDisplayName(r.user_id)}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{formatTime(r.created_at)}</span>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="p-1 rounded hover:bg-muted"
                  >
                    {expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Message */}
              <p className="text-sm text-foreground">{r.message}</p>

              {/* Expanded details */}
              {expandedId === r.id && (
                <div className="space-y-2 pt-2 border-t border-border">
                  {r.page_url && (
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium">Side:</span>
                      <p className="text-[11px] text-foreground break-all">{r.page_url}</p>
                    </div>
                  )}
                  {r.user_agent && (
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium">User Agent:</span>
                      <p className="text-[10px] text-muted-foreground break-all">{r.user_agent}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <DavosButton variant="outline" size="sm" onClick={() => copyReport(r)} className="flex-1">
                      {copiedId === r.id ? <Check size={14} className="mr-1 text-primary" /> : <Copy size={14} className="mr-1" />}
                      {copiedId === r.id ? "Kopiert!" : "Kopier"}
                    </DavosButton>
                    <DavosButton variant="outline" size="sm" onClick={() => deleteReport(r.id)} className="text-destructive">
                      <Trash2 size={14} />
                    </DavosButton>
                  </div>
                </div>
              )}
            </DavosCardContent>
          </DavosCard>
        ))
      )}
    </div>
  );
});
AdminBugReports.displayName = "AdminBugReports";
