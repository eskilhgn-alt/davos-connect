/**
 * AdminScreen – Adminhub for GüttaHütte.
 * Faner: Oversikt, Brukere, Innhold (moderering), Push, Varsler, Feil, Logg.
 * Historiske spillmoduler er fjernet fra aktiv admin.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { BrandSegmented, type SegmentOption } from "@/components/ui/brand-segmented";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminData } from "@/components/admin/useAdminData";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminUserList } from "@/components/admin/AdminUserList";
import { AdminPushTools } from "@/components/admin/AdminPushTools";
import { AdminAuditLog } from "@/components/admin/AdminAuditLog";
import { AdminBugReports } from "@/components/admin/AdminBugReports";
import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";
import { AdminModeration } from "@/components/admin/AdminModeration";
import { AdminTrips } from "@/components/admin/AdminTrips";

const TAB_OPTIONS: SegmentOption[] = [
  { value: "overview", label: "Oversikt" },
  { value: "trips", label: "Turer" },
  { value: "users", label: "Brukere" },
  { value: "moderate", label: "Innhold" },
  { value: "push", label: "Push" },
  { value: "announce", label: "Varsler" },
  { value: "bugs", label: "Feil" },
  { value: "log", label: "Logg" },
];

export const AdminScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const [searchParams] = useSearchParams();
  // Deep-link fra Oppdag: /admin?tab=trips&trip=<id>
  const initialTab = TAB_OPTIONS.some((o) => o.value === searchParams.get("tab"))
    ? (searchParams.get("tab") as string)
    : "overview";
  const [tab, setTab] = React.useState(initialTab);
  const deepLinkTripId = searchParams.get("trip");

  const isAuthorized = isAdmin;

  const {
    users, stats, auditLog,
    loading, logAction,
    fetchUsers, fetchAuditLog, refreshAll,
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

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Admin"
        subtitle={`${users.length} brukere`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        <div className="px-4 pt-3 pb-2 overflow-x-auto">
          <BrandSegmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
        </div>

        {tab === "overview" && (
          <AdminOverview stats={stats} users={users} onNavigate={setTab} />
        )}

        {tab === "trips" && <AdminTrips initialTripId={deepLinkTripId} />}

        {tab === "users" && (
          <AdminUserList
            users={users}
            loading={loading}
            currentUserId={user!.id}
            onRefresh={fetchUsers}
            onLogAction={logAction}
          />
        )}

        {tab === "moderate" && (
          <AdminModeration
            users={users}
            currentUserId={user!.id}
            onLogAction={logAction}
          />
        )}

        {tab === "push" && (
          <AdminPushTools
            users={users}
          />
        )}

        {tab === "bugs" && (
          <AdminBugReports users={users} />
        )}

        {tab === "announce" && (
          <div className="px-4 py-2">
            <AdminAnnouncements />
          </div>
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
