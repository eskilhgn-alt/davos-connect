/**
 * AdminScreen – Comprehensive admin dashboard for GüttaHütte
 * Safari-first, mobile-first, max 2 clicks to action
 * Tabs: Oversikt, Brukere, Shot, Tokens, Push, Logg
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosSegmented, type SegmentOption } from "@/components/ui/davos-segmented";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminData } from "@/components/admin/useAdminData";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { AdminShotControl } from "@/components/admin/AdminShotControl";
import { AdminTokenLedger } from "@/components/admin/AdminTokenLedger";
import { AdminPushTools } from "@/components/admin/AdminPushTools";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";

const ADMIN_EMAIL = "eskilhgn@gmail.com";

const TAB_OPTIONS: SegmentOption[] = [
  { value: "overview", label: "Oversikt" },
  { value: "users", label: "Brukere" },
  { value: "shot", label: "Shot" },
  { value: "tokens", label: "Tokens" },
  { value: "push", label: "Push" },
  { value: "log", label: "Logg" },
];

export const AdminScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const [tab, setTab] = React.useState("overview");
  const [preselectedUserId, setPreselectedUserId] = React.useState<string | null>(null);

  const isAuthorized = isAdmin && user?.email === ADMIN_EMAIL;

  const {
    users, stats, activeShots, shotHistory, corrections, auditLog,
    loading, getDisplayName, logAction,
    fetchUsers, fetchActiveShots, fetchCorrections, fetchAuditLog, refreshAll,
  } = useAdminData();

  React.useEffect(() => {
    if (!authLoading && !isAuthorized) {
      toast.error("Ingen tilgang");
      navigate("/");
    }
  }, [isAuthorized, authLoading, navigate]);

  React.useEffect(() => {
    if (isAuthorized) refreshAll();
  }, [isAuthorized, refreshAll]);

  if (authLoading || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleAdjustTokens = (userId: string) => {
    setPreselectedUserId(userId);
    setTab("shot");
  };

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Admin"
        subtitle={`${users.length} brukere`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        {/* Tab bar – scrollable for 6 tabs */}
        <div className="px-4 pt-3 pb-2 overflow-x-auto">
          <DavosSegmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
        </div>

        {tab === "overview" && (
          <AdminOverview
            stats={stats}
            users={users}
            currentUserId={user!.id}
            onNavigate={setTab}
            onLogAction={logAction}
          />
        )}

        {tab === "users" && (
          <AdminUserList
            users={users}
            loading={loading}
            currentUserId={user!.id}
            onRefresh={fetchUsers}
            onAdjustTokens={handleAdjustTokens}
            onLogAction={logAction}
          />
        )}

        {tab === "shot" && (
          <AdminShotControl
            users={users}
            activeShots={activeShots}
            shotHistory={shotHistory}
            corrections={corrections}
            currentUserId={user!.id}
            getDisplayName={getDisplayName}
            onRefreshShots={fetchActiveShots}
            onRefreshUsers={fetchUsers}
            onRefreshCorrections={fetchCorrections}
            onLogAction={logAction}
            preselectedUserId={preselectedUserId}
          />
        )}

        {tab === "tokens" && (
          <AdminTokenLedger users={users} />
        )}

        {tab === "push" && (
          <AdminPushTools
            users={users}
            currentUserId={user!.id}
            onLogAction={logAction}
          />
        )}

        {tab === "log" && (
          <AdminAuditLog
            auditLog={auditLog}
            users={users}
            loading={loading}
            onRefresh={fetchAuditLog}
          />
        )}
      </div>
    </div>
  );
};

export default AdminScreen;
