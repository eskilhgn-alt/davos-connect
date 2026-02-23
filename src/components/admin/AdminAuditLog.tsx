/**
 * AdminAuditLog – Read-only audit log of all admin actions
 */
import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosBadge } from "@/components/ui/davos-badge";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { ScrollText, RefreshCw } from "lucide-react";
import type { AdminUser } from "./useAdminData";

const ACTION_LABELS: Record<string, string> = {
  token_adjust: "Token-justering",
  shot_reset: "Shot-reset",
  user_deactivated: "Bruker deaktivert",
  user_activated: "Bruker aktivert",
  user_banned: "Bruker utestengt",
  user_unbanned: "Ban opphevet",
  push_sent: "Push sendt",
  direct_push: "Direkte push",
  broadcast_push: "Broadcast push",
  test_push_sent: "Test-push",
  profile_edited: "Profil redigert",
  password_reset_sent: "Passord-reset sendt",
  frikort_granted: "Frikort gitt",
  penalty_removed: "Straff fjernet",
  invite_sent: "Invitasjon sendt",
  admin_note_added: "Notat lagt til",
};

interface Props {
  auditLog: any[];
  users: AdminUser[];
  loading: boolean;
  onRefresh: () => void;
}

export const AdminAuditLog = React.forwardRef<HTMLDivElement, Props>(({ auditLog, users, loading, onRefresh }, ref) => {
  const getDisplayName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || userId?.slice(0, 8) || "—";
  };

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-primary" />
          <h3 className="font-heading font-semibold text-foreground text-sm">Audit-logg</h3>
        </div>
        <DavosButton variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw size={14} />
        </DavosButton>
      </div>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <DavosSkeleton key={i} className="h-14 w-full" />)
      ) : auditLog.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">Ingen hendelser ennå</p>
      ) : (
        <div className="space-y-1">
          {auditLog.map(entry => (
            <DavosCard key={entry.id}>
              <DavosCardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <DavosBadge variant="default">
                        {ACTION_LABELS[entry.action] || entry.action}
                      </DavosBadge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Admin: {getDisplayName(entry.admin_id)}
                      {entry.target_user_id && ` → ${getDisplayName(entry.target_user_id)}`}
                    </p>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString("nb-NO", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              </DavosCardContent>
            </DavosCard>
          ))}
        </div>
      )}
    </div>
  );
});
AdminAuditLog.displayName = "AdminAuditLog";
