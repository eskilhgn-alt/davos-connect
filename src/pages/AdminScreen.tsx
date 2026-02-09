/**
 * AdminScreen - Comprehensive admin dashboard
 * Features: user management, shot reset, token correction, witness approval for gamification edits
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosBadge } from "@/components/ui/davos-badge";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosSegmented, type SegmentOption } from "@/components/ui/davos-segmented";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";
import {
  Users, Search, RefreshCw, Loader2, Mail, Send, MessageCircle,
  CalendarDays, Target, Coins, RotateCcw,
  Plus, Minus, Eye, Check, X, Ticket,
} from "lucide-react";
import { toast } from "sonner";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
  created_at: string;
  role: "user" | "admin";
  token_balance?: number;
  frikort_count?: number;
}

const ADMIN_EMAIL = "eskilhgn@gmail.com";

const TAB_OPTIONS: SegmentOption[] = [
  { value: "overview", label: "Oversikt" },
  { value: "users", label: "Brukere" },
  { value: "shot", label: "Shot" },
  { value: "corrections", label: "Korrigeringer" },
];

export const AdminScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const [users, setUsers] = React.useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("overview");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteMessage, setInviteMessage] = React.useState("");
  const [inviteSending, setInviteSending] = React.useState(false);
  const [stats, setStats] = React.useState<{
    totalUsers: number; activeUsers: number; totalMessages: number;
    totalEvents: number; totalShotRounds: number; messagesLast7d: number;
  } | null>(null);

  // Token adjustment state
  const [adjustUserId, setAdjustUserId] = React.useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = React.useState(0);
  const [adjustReason, setAdjustReason] = React.useState("");

  // Active shot events
  const [activeShots, setActiveShots] = React.useState<any[]>([]);

  // Pending corrections
  const [corrections, setCorrections] = React.useState<any[]>([]);

  const isAuthorized = isAdmin && user?.email === ADMIN_EMAIL;

  React.useEffect(() => {
    if (!authLoading && !isAuthorized) {
      toast.error("Ingen tilgang");
      navigate("/");
    }
  }, [isAuthorized, authLoading, navigate]);

  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [profilesRes, rolesRes, tokensRes, frikortRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.rpc("rpc_get_all_shot_tokens"),
        supabase.from("user_frikort").select("user_id").is("used_at", null),
      ]);

      const rolesMap = new Map((rolesRes.data || []).map(r => [r.user_id, r.role]));
      const tokensArr = (tokensRes.data as any[] | null) || [];
      const tokensMap = new Map(tokensArr.map((t: any) => [t.user_id, t.balance]));
      const frikortMap = new Map<string, number>();
      (frikortRes.data || []).forEach((f: any) => {
        frikortMap.set(f.user_id, (frikortMap.get(f.user_id) || 0) + 1);
      });

      setUsers((profilesRes.data || []).map(p => ({
        id: p.id, email: p.email, full_name: p.full_name,
        nickname: p.nickname, is_active: p.is_active, created_at: p.created_at,
        role: (rolesMap.get(p.id) as "user" | "admin") || "user",
        token_balance: tokensMap.get(p.id) ?? 5,
        frikort_count: frikortMap.get(p.id) ?? 0,
      })));
    } catch {
      toast.error("Kunne ikke hente brukere");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = React.useCallback(async () => {
    try {
      const [msgRes, msg7dRes, evtRes, shotRes] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from("agenda_events").select("id", { count: "exact", head: true }),
        supabase.from("shot_events").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        totalUsers: users.length, activeUsers: users.filter(u => u.is_active).length,
        totalMessages: msgRes.count ?? 0, messagesLast7d: msg7dRes.count ?? 0,
        totalEvents: evtRes.count ?? 0, totalShotRounds: shotRes.count ?? 0,
      });
    } catch {}
  }, [users]);

  const fetchActiveShots = React.useCallback(async () => {
    const { data } = await supabase.from("shot_events")
      .select("*")
      .in("status", ["countdown", "selected", "overdue"])
      .order("created_at", { ascending: false })
      .limit(10);
    setActiveShots(data || []);
  }, []);

  const fetchCorrections = React.useCallback(async () => {
    const { data } = await supabase.from("admin_corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setCorrections(data || []);
  }, []);

  React.useEffect(() => {
    if (isAuthorized) {
      fetchUsers();
      fetchActiveShots();
      fetchCorrections();
    }
  }, [isAuthorized, fetchUsers, fetchActiveShots, fetchCorrections]);

  React.useEffect(() => { if (users.length > 0) fetchStats(); }, [users, fetchStats]);

  const getDisplayName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || "Ukjent";
  };




  const resetShotEvent = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      // Create correction with witness requirement
      const witnessUser = users.find(u => u.id !== user?.id && u.is_active);
      if (!witnessUser) {
        toast.error("Ingen tilgjengelig vitne");
        return;
      }

      const { error } = await supabase.from("admin_corrections").insert({
        admin_id: user!.id,
        correction_type: "shot_reset",
        payload: { event_id: eventId },
        witness_id: witnessUser.id,
      });

      if (error) throw error;

      // Send push to witness
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "admin_correction",
            heading: "Admin-korreksjon venter! 👁",
            message: `Admin vil resette en shotterunde. Godkjenn i appen.`,
            include_user_ids: [witnessUser.id],
          }),
        }).catch(() => {});
      }

      toast.success(`Korreksjon sendt til ${getDisplayName(witnessUser.id)} for godkjenning`);
      fetchCorrections();
    } catch {
      toast.error("Feil ved reset");
    } finally { setActionLoading(null); }
  };

  const adjustTokens = async () => {
    if (!adjustUserId || adjustDelta === 0 || !adjustReason.trim()) return;
    setActionLoading("adjust");
    try {
      // Create correction with witness
      const witnessUser = users.find(u => u.id !== user?.id && u.is_active);
      if (!witnessUser) { toast.error("Ingen vitne tilgjengelig"); return; }

      await supabase.from("admin_corrections").insert({
        admin_id: user!.id,
        target_user_id: adjustUserId,
        correction_type: "token_adjust",
        payload: { delta: adjustDelta, reason: adjustReason },
        witness_id: witnessUser.id,
      });

      // Push to witness
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: "admin_correction",
            heading: "Tokenkorrigering venter! 💰",
            message: `Admin vil justere ${adjustDelta > 0 ? "+" : ""}${adjustDelta} tokens for ${getDisplayName(adjustUserId)}. Godkjenn i appen.`,
            include_user_ids: [witnessUser.id],
          }),
        }).catch(() => {});
      }

      toast.success("Korreksjon sendt til vitne for godkjenning");
      setAdjustUserId(null); setAdjustDelta(0); setAdjustReason("");
      fetchCorrections();
    } catch {
      toast.error("Feil ved tokenkorrigering");
    } finally { setActionLoading(null); }
  };

  const approveCorrection = async (correctionId: string) => {
    setActionLoading(correctionId);
    try {
      const correction = corrections.find(c => c.id === correctionId);
      if (!correction) return;

      // Mark approved
      await supabase.from("admin_corrections").update({
        witness_approved: true, witness_responded_at: new Date().toISOString(),
      }).eq("id", correctionId);

      // Execute the actual correction
      if (correction.correction_type === "token_adjust") {
        await supabase.rpc("rpc_admin_adjust_tokens", {
          p_user_id: correction.target_user_id,
          p_delta: correction.payload.delta,
          p_reason: correction.payload.reason,
        });
      } else if (correction.correction_type === "shot_reset") {
        await supabase.rpc("rpc_admin_reset_shot_event", {
          p_event_id: correction.payload.event_id,
        });
      }

      toast.success("Korreksjon godkjent og utført!");
      fetchCorrections();
      fetchUsers();
      fetchActiveShots();
    } catch {
      toast.error("Feil ved godkjenning");
    } finally { setActionLoading(null); }
  };

  const rejectCorrection = async (correctionId: string) => {
    setActionLoading(correctionId);
    try {
      await supabase.from("admin_corrections").update({
        witness_approved: false, witness_responded_at: new Date().toISOString(),
      }).eq("id", correctionId);
      toast.success("Korreksjon avslått");
      fetchCorrections();
    } finally { setActionLoading(null); }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    try {
      const res = await supabase.functions.invoke("send-invite", {
        body: { email: inviteEmail.trim(), message: inviteMessage.trim() || undefined },
      });
      if (res.error) throw res.error;
      toast.success(`Invitasjon sendt til ${inviteEmail}`);
      setInviteEmail(""); setInviteMessage("");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke sende invitasjon");
    } finally { setInviteSending(false); }
  };

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.nickname?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  if (authLoading || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCorrections = corrections.filter(c => !c.witness_responded_at && c.witness_id === user?.id);
  const myPendingCorrections = corrections.filter(c => !c.witness_responded_at && c.admin_id === user?.id);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Admin" subtitle={`${users.length} brukere`} leftAction={<BackButton fallbackPath="/hjem" />} />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        <div className="px-4 pt-3 pb-2">
          <DavosSegmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="px-4 space-y-4 pb-6">
            {stats && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: Users, val: `${stats.activeUsers}/${stats.totalUsers}`, label: "Aktive" },
                  { icon: MessageCircle, val: stats.totalMessages, label: "Meldinger" },
                  { icon: MessageCircle, val: stats.messagesLast7d, label: "Siste 7d" },
                  { icon: CalendarDays, val: stats.totalEvents, label: "Agenda" },
                  { icon: Target, val: stats.totalShotRounds, label: "Shot-runder" },
                ].map((s, i) => (
                  <DavosCard key={i}>
                    <DavosCardContent className="p-3 text-center">
                      <s.icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold text-foreground">{s.val}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </DavosCardContent>
                  </DavosCard>
                ))}
              </div>
            )}

            {/* Invite */}
            <DavosCard>
              <DavosCardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  <h2 className="font-heading font-semibold text-foreground">Send invitasjon</h2>
                </div>
                <DavosInput type="email" placeholder="E-postadresse" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <DavosInput type="text" placeholder="Personlig melding (valgfritt)" value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} />
                <DavosButton onClick={sendInvite} disabled={inviteSending || !inviteEmail.trim()} className="w-full">
                  {inviteSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send invitasjon
                </DavosButton>
              </DavosCardContent>
            </DavosCard>

            {/* Pending witness approvals */}
            {pendingCorrections.length > 0 && (
              <DavosCard className="border-destructive/30">
                <DavosCardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-destructive" />
                    <h2 className="font-heading font-semibold text-foreground">Venter på din godkjenning</h2>
                  </div>
                  {pendingCorrections.map(c => (
                    <div key={c.id} className="border border-border rounded-lg p-3 space-y-2">
                      <p className="text-sm text-foreground">
                        {c.correction_type === "token_adjust"
                          ? `Tokenkorrigering: ${c.payload.delta > 0 ? "+" : ""}${c.payload.delta} for ${getDisplayName(c.target_user_id)}`
                          : `Reset shotterunde`
                        }
                      </p>
                      {c.payload.reason && <p className="text-xs text-muted-foreground">Grunn: {c.payload.reason}</p>}
                      <div className="flex gap-2">
                        <DavosButton size="sm" onClick={() => approveCorrection(c.id)} disabled={actionLoading === c.id}>
                          <Check className="h-4 w-4 mr-1" /> Godkjenn
                        </DavosButton>
                        <DavosButton variant="outline" size="sm" onClick={() => rejectCorrection(c.id)} disabled={actionLoading === c.id}>
                          <X className="h-4 w-4 mr-1" /> Avslå
                        </DavosButton>
                      </div>
                    </div>
                  ))}
                </DavosCardContent>
              </DavosCard>
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="px-4 space-y-3 pb-6">
            <div className="flex gap-2">
              <DavosInput type="search" placeholder="Søk brukere..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1" />
              <DavosButton variant="outline" onClick={fetchUsers} disabled={isLoading}>
                <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
              </DavosButton>
            </div>

            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <DavosSkeleton key={i} className="h-24 w-full" />)
            ) : (
              filteredUsers.map((u) => (
                <AdminUserDetail
                  key={u.id}
                  user={u}
                  currentUserId={user?.id || ""}
                  onRefresh={fetchUsers}
                  onAdjustTokens={(userId) => { setAdjustUserId(userId); setTab("shot"); }}
                />
              ))
            )}
          </div>
        )}

        {/* SHOT TAB */}
        {tab === "shot" && (
          <div className="px-4 space-y-4 pb-6">
            {/* Token adjustment */}
            <DavosCard>
              <DavosCardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  <h2 className="font-heading font-semibold text-foreground">Juster tokens</h2>
                </div>
                <select
                  value={adjustUserId || ""}
                  onChange={(e) => setAdjustUserId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm text-foreground"
                >
                  <option value="">Velg bruker...</option>
                  {users.filter(u => u.is_active).map(u => (
                    <option key={u.id} value={u.id}>{u.nickname || u.full_name || u.email} ({u.token_balance} tokens)</option>
                  ))}
                </select>
                <div className="flex gap-2 items-center">
                  <DavosButton variant="outline" size="sm" onClick={() => setAdjustDelta(d => d - 1)}>
                    <Minus size={16} />
                  </DavosButton>
                  <span className="font-mono text-lg font-bold text-foreground min-w-[40px] text-center">
                    {adjustDelta > 0 ? "+" : ""}{adjustDelta}
                  </span>
                  <DavosButton variant="outline" size="sm" onClick={() => setAdjustDelta(d => d + 1)}>
                    <Plus size={16} />
                  </DavosButton>
                </div>
                <DavosInput placeholder="Grunn for korrigering..." value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                <DavosButton onClick={adjustTokens} disabled={!adjustUserId || adjustDelta === 0 || !adjustReason.trim() || actionLoading === "adjust"} className="w-full">
                  {actionLoading === "adjust" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  Send til vitne for godkjenning
                </DavosButton>
                <p className="text-[10px] text-muted-foreground">Alle tokenkorrigeringer krever godkjenning fra et vitne via push-varsel.</p>
              </DavosCardContent>
            </DavosCard>

            {/* Active shot events */}
            <DavosCard>
              <DavosCardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <h2 className="font-heading font-semibold text-foreground">Aktive runder</h2>
                  </div>
                  <DavosButton variant="ghost" size="sm" onClick={fetchActiveShots}>
                    <RefreshCw size={14} />
                  </DavosButton>
                </div>
                {activeShots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Ingen aktive runder</p>
                ) : (
                  activeShots.map(e => (
                    <div key={e.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{e.status}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.selected_user_id ? getDisplayName(e.selected_user_id) : "Nedtelling..."}
                        </p>
                      </div>
                      <DavosButton variant="outline" size="sm" onClick={() => resetShotEvent(e.id)} disabled={actionLoading === e.id}>
                        {actionLoading === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </DavosButton>
                    </div>
                  ))
                )}
              </DavosCardContent>
            </DavosCard>
          </div>
        )}

        {/* CORRECTIONS TAB */}
        {tab === "corrections" && (
          <div className="px-4 space-y-3 pb-6">
            <DavosButton variant="outline" onClick={fetchCorrections} className="w-full">
              <RefreshCw size={14} className="mr-2" /> Oppdater
            </DavosButton>
            {corrections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Ingen korrigeringer ennå</p>
            ) : (
              corrections.map(c => (
                <DavosCard key={c.id}>
                  <DavosCardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {c.correction_type === "token_adjust" ? "Tokenkorrigering" : c.correction_type === "shot_reset" ? "Shot-reset" : c.correction_type}
                      </span>
                      {c.witness_approved === true && <DavosBadge variant="accent">Godkjent</DavosBadge>}
                      {c.witness_approved === false && c.witness_responded_at && <DavosBadge variant="critical">Avslått</DavosBadge>}
                      {!c.witness_responded_at && <DavosBadge variant="default">Venter</DavosBadge>}
                    </div>
                    {c.target_user_id && <p className="text-xs text-muted-foreground">Bruker: {getDisplayName(c.target_user_id)}</p>}
                    {c.payload?.reason && <p className="text-xs text-muted-foreground">Grunn: {c.payload.reason}</p>}
                    {c.payload?.delta !== undefined && <p className="text-xs text-muted-foreground">Delta: {c.payload.delta > 0 ? "+" : ""}{c.payload.delta}</p>}
                    <p className="text-[10px] text-muted-foreground">Vitne: {getDisplayName(c.witness_id)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString("nb-NO")}</p>

                    {/* If current user is witness and hasn't responded */}
                    {c.witness_id === user?.id && !c.witness_responded_at && (
                      <div className="flex gap-2 pt-1">
                        <DavosButton size="sm" onClick={() => approveCorrection(c.id)} disabled={actionLoading === c.id}>
                          <Check className="h-3 w-3 mr-1" /> Godkjenn
                        </DavosButton>
                        <DavosButton variant="outline" size="sm" onClick={() => rejectCorrection(c.id)} disabled={actionLoading === c.id}>
                          <X className="h-3 w-3 mr-1" /> Avslå
                        </DavosButton>
                      </div>
                    )}
                  </DavosCardContent>
                </DavosCard>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminScreen;