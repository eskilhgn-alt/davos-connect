/**
 * useAdminData – Central data hook for admin dashboard
 * Fetches users, activity stats and audit data for the generic trip app.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  role: "user" | "admin";
}

export interface AdminStats {
  activeUsers24h: number;
  totalUsers: number;
  activeUsers: number;
  pushUsers: number;
  pushOk: boolean;
}

export interface AdminAuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function useAdminData() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [auditLog, setAuditLog] = React.useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const getDisplayName = React.useCallback((userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || "Ukjent";
  }, [users]);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      const rolesMap = new Map((rolesRes.data || []).map(r => [r.user_id, r.role]));

      setUsers((profilesRes.data || []).map(p => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        nickname: p.nickname,
        is_active: p.is_active,
        is_banned: p.is_banned ?? false,
        banned_at: p.banned_at ?? null,
        ban_reason: p.ban_reason ?? null,
        avatar_url: p.avatar_url ?? null,
        email_verified: p.email_verified ?? true,
        created_at: p.created_at,
        updated_at: p.updated_at,
        role: (rolesMap.get(p.id) as "user" | "admin") || "user",
      })));
    } catch {
      errorToast("Kunne ikke hente brukere");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = React.useCallback(async () => {
    try {
      const now24h = new Date(Date.now() - 86400000).toISOString();
      const [msgRes, pushRes] = await Promise.all([
        supabase
          .from("messages")
          .select("sender_id", { count: "exact", head: false })
          .gte("created_at", now24h),
        supabase.from("push_tokens").select("user_id").not("player_id", "is", null),
      ]);

      // Count unique active users from messages in last 24h (exclude system senders)
      const uniqueSenders = new Set(
        (msgRes.data || [])
          .map((message) => message.sender_id)
          .filter((id: string) => id !== 'system' && id !== '00000000-0000-0000-0000-000000000000')
      );

      const activeIds = new Set(users.filter((profile) => profile.is_active && !profile.is_banned).map((profile) => profile.id));
      const pushIds = new Set((pushRes.data || []).map((token) => token.user_id).filter((id) => activeIds.has(id)));

      setStats({
        activeUsers24h: uniqueSenders.size,
        totalUsers: users.length,
        activeUsers: activeIds.size,
        pushUsers: pushIds.size,
        pushOk: activeIds.size > 0 && pushIds.size === activeIds.size,
      });
    } catch (error) {
      console.warn("[Admin] Kunne ikke hente statistikk", error);
    }
  }, [users]);

  const fetchAuditLog = React.useCallback(async () => {
    const { data } = await supabase.from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLog((data || []) as AdminAuditEntry[]);
  }, []);

  const logAction = React.useCallback(async (
    adminId: string, action: string, targetUserId?: string, details?: Record<string, unknown>
  ) => {
    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_user_id: targetUserId || null,
      details: details || {},
    });
  }, []);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([fetchUsers(), fetchAuditLog()]);
  }, [fetchUsers, fetchAuditLog]);

  React.useEffect(() => {
    if (users.length > 0) fetchStats();
  }, [users, fetchStats]);

  return {
    users, stats, auditLog,
    loading, getDisplayName, logAction,
    fetchUsers, fetchStats, fetchAuditLog,
    refreshAll,
  };
}
