/**
 * useAdminData – Central data hook for admin dashboard
 * Fetches users, stats, shots, corrections, audit log
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
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
  shotRounds24h: number;
  pushOk: boolean;
}

export function useAdminData() {
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [activeShots, setActiveShots] = React.useState<any[]>([]);
  const [shotHistory, setShotHistory] = React.useState<any[]>([]);
  const [corrections, setCorrections] = React.useState<any[]>([]);
  const [auditLog, setAuditLog] = React.useState<any[]>([]);
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
        email_verified: (p as any).email_verified ?? true,
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
      const [shotRes, msgRes] = await Promise.all([
        supabase.from("shot_events").select("id", { count: "exact", head: true }).gte("created_at", now24h),
        supabase.from("messages").select("sender_id", { count: "exact", head: false }).gte("created_at", now24h),
      ]);

      const uniqueSenders = new Set(
        (msgRes.data || [])
          .map((m: any) => m.sender_id)
          .filter((id: string) => id !== 'system' && id !== '00000000-0000-0000-0000-000000000000')
      );

      setStats({
        activeUsers24h: uniqueSenders.size,
        totalUsers: users.length,
        shotRounds24h: shotRes.count ?? 0,
        pushOk: true,
      });
    } catch { }
  }, [users]);

  const fetchActiveShots = React.useCallback(async () => {
    const [activeRes, historyRes] = await Promise.all([
      supabase.from("shot_events")
        .select("*")
        .in("status", ["countdown", "selected", "disputed"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("shot_events")
        .select("*")
        .gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setActiveShots(activeRes.data || []);
    setShotHistory(historyRes.data || []);
  }, []);

  const fetchCorrections = React.useCallback(async () => {
    const { data } = await supabase.from("admin_corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setCorrections(data || []);
  }, []);

  const fetchAuditLog = React.useCallback(async () => {
    const { data } = await supabase.from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLog(data || []);
  }, []);

  const logAction = React.useCallback(async (
    adminId: string, action: string, targetUserId?: string, details?: Record<string, any>
  ) => {
    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_user_id: targetUserId || null,
      details: details || {},
    });
  }, []);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([fetchUsers(), fetchActiveShots(), fetchCorrections(), fetchAuditLog()]);
  }, [fetchUsers, fetchActiveShots, fetchCorrections, fetchAuditLog]);

  React.useEffect(() => {
    if (users.length > 0) fetchStats();
  }, [users, fetchStats]);

  return {
    users, stats, activeShots, shotHistory, corrections, auditLog,
    loading, getDisplayName, logAction,
    fetchUsers, fetchStats, fetchActiveShots, fetchCorrections, fetchAuditLog,
    refreshAll,
  };
}
