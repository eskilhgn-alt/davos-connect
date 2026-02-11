/**
 * AdminUserDetail – Expandable user detail panel for admin management
 * Edit profile, send password reset, manage roles, notes, view activity
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  UserX, UserCheck, Coins, Ticket, Loader2, Key, Save,
  ChevronDown, ChevronUp, Bell, Edit3, ShieldOff, StickyNote, Send,
  Mail, CheckCircle, XCircle, Calendar, Shield, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  avatar_url?: string | null;
  email_verified?: boolean;
  created_at: string;
  updated_at?: string;
  role: "user" | "admin";
  token_balance?: number;
  frikort_count?: number;
}

interface Props {
  user: UserProfile;
  currentUserId: string;
  onRefresh: () => void;
  onAdjustTokens: (userId: string) => void;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

interface AdminNote {
  id: string;
  note: string;
  created_at: string;
}

export const AdminUserDetail: React.FC<Props> = ({ user: u, currentUserId, onRefresh, onAdjustTokens, onLogAction }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState(false);
  const [editName, setEditName] = React.useState(u.full_name || "");
  const [editNickname, setEditNickname] = React.useState(u.nickname || "");
  const [notes, setNotes] = React.useState<AdminNote[]>([]);
  const [newNote, setNewNote] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);

  const fetchNotes = React.useCallback(async () => {
    const { data } = await supabase.from("admin_notes")
      .select("id, note, created_at")
      .eq("target_user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setNotes(data || []);
  }, [u.id]);

  React.useEffect(() => {
    if (expanded && showNotes) fetchNotes();
  }, [expanded, showNotes, fetchNotes]);

  const toggleActive = async () => {
    setLoading("toggle");
    try {
      await supabase.from("profiles").update({ is_active: !u.is_active }).eq("id", u.id);
      const action = u.is_active ? "user_deactivated" : "user_activated";
      toast.success(u.is_active ? "Bruker deaktivert" : "Bruker aktivert");
      onLogAction(currentUserId, action, u.id);
      onRefresh();
    } finally { setLoading(null); }
  };

  const saveProfile = async () => {
    setLoading("save");
    try {
      await supabase.from("profiles").update({
        full_name: editName.trim() || null,
        nickname: editNickname.trim() || null,
      }).eq("id", u.id);
      toast.success("Profil oppdatert");
      onLogAction(currentUserId, "profile_edited", u.id, { full_name: editName, nickname: editNickname });
      setEditMode(false);
      onRefresh();
    } finally { setLoading(null); }
  };

  const sendPasswordReset = async () => {
    setLoading("reset");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Passord-reset sendt til ${u.email}`);
      onLogAction(currentUserId, "password_reset_sent", u.id);
    } catch (e: any) {
      errorToast("Kunne ikke sende reset", { description: e.message });
    } finally { setLoading(null); }
  };

  const sendPushNotification = async () => {
    setLoading("push");
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Ikke autentisert");
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "admin_notification",
          heading: "Melding fra admin 📢",
          message: "Sjekk innstillingene dine i appen.",
          include_user_ids: [u.id],
        }),
      });
      toast.success("Push-varsel sendt");
      onLogAction(currentUserId, "push_sent", u.id);
    } catch {
      errorToast("Kunne ikke sende push");
    } finally { setLoading(null); }
  };

  const toggleBan = async () => {
    setLoading("ban");
    try {
      const { error } = await supabase.rpc("rpc_admin_set_ban", {
        p_user_id: u.id,
        p_banned: !u.is_banned,
        p_reason: u.is_banned ? null : "Admin-utestengelse",
      } as any);
      if (error) throw error;
      const action = u.is_banned ? "user_unbanned" : "user_banned";
      toast.success(u.is_banned ? "Ban opphevet" : "Bruker utestengt");
      onLogAction(currentUserId, action, u.id);
      onRefresh();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setLoading(null); }
  };

  const deleteUser = async () => {
    setLoading("delete");
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { target_user_id: u.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${u.nickname || u.full_name || u.email} er slettet`);
      onLogAction(currentUserId, "user_deleted", u.id);
      onRefresh();
    } catch (e: any) {
      errorToast("Kunne ikke slette bruker", { description: e.message });
    } finally { setLoading(null); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setLoading("note");
    try {
      await supabase.from("admin_notes").insert({
        admin_id: currentUserId,
        target_user_id: u.id,
        note: newNote.trim(),
      });
      toast.success("Notat lagt til");
      onLogAction(currentUserId, "admin_note_added", u.id);
      setNewNote("");
      fetchNotes();
    } catch {
      errorToast("Kunne ikke lagre notat");
    } finally { setLoading(null); }
  };

  return (
    <DavosCard>
      <DavosCardContent className="p-4">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start justify-between text-left gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <DavosAvatar
              src={u.avatar_url || undefined}
              fallback={u.nickname || u.full_name || u.email}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-medium text-foreground truncate">{u.full_name || u.email}</p>
                {u.role === "admin" && <DavosBadge variant="accent">Admin</DavosBadge>}
                {!u.is_active && <DavosBadge variant="critical">Inaktiv</DavosBadge>}
                {u.is_banned && <DavosBadge variant="critical">🚫 Ban</DavosBadge>}
              </div>
              {u.nickname && <p className="text-xs text-muted-foreground">«{u.nickname}»</p>}
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
          </div>
          {expanded ? <ChevronUp size={18} className="text-muted-foreground mt-1 shrink-0" /> : <ChevronDown size={18} className="text-muted-foreground mt-1 shrink-0" />}
        </button>

        {expanded && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            {/* Profile info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <p className="text-muted-foreground">Fullt navn</p>
                <p className="font-medium text-foreground">{u.full_name || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Kallenavn</p>
                <p className="font-medium text-foreground">{u.nickname || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">E-post</p>
                <p className="font-medium text-foreground">{u.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">E-post verifisert</p>
                <p className="font-medium flex items-center gap-1">
                  {u.email_verified ? (
                    <><CheckCircle size={12} className="text-green-500" /> Ja</>
                  ) : (
                    <><XCircle size={12} className="text-destructive" /> Nei</>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Rolle</p>
                <p className="font-medium flex items-center gap-1">
                  <Shield size={12} /> {u.role === "admin" ? "Admin" : "Bruker"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Registrert</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar size={12} /> {new Date(u.created_at).toLocaleDateString("nb-NO")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">
                  {u.is_banned ? "🚫 Utestengt" : u.is_active ? "✅ Aktiv" : "⏸️ Inaktiv"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tokens</p>
                <p className="font-medium flex items-center gap-1"><Coins size={12} /> {u.token_balance ?? 5}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Frikort</p>
                <p className="font-medium flex items-center gap-1"><Ticket size={12} /> {u.frikort_count ?? 0}</p>
              </div>
            </div>

            {u.is_banned && u.ban_reason && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground">Ban-grunn</p>
                <p className="text-xs text-foreground">{u.ban_reason}</p>
                {u.banned_at && <p className="text-[10px] text-muted-foreground mt-1">Utestengt: {new Date(u.banned_at).toLocaleString("nb-NO")}</p>}
              </div>
            )}

            {/* Edit profile */}
            {editMode ? (
              <div className="space-y-2">
                <DavosInput placeholder="Fullt navn" value={editName} onChange={e => setEditName(e.target.value)} />
                <DavosInput placeholder="Kallenavn" value={editNickname} onChange={e => setEditNickname(e.target.value)} />
                <div className="flex gap-2">
                  <DavosButton size="sm" onClick={saveProfile} disabled={loading === "save"}>
                    {loading === "save" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                    Lagre
                  </DavosButton>
                  <DavosButton variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</DavosButton>
                </div>
              </div>
            ) : (
              <DavosButton variant="outline" size="sm" onClick={() => { setEditName(u.full_name || ""); setEditNickname(u.nickname || ""); setEditMode(true); }}>
                <Edit3 size={14} className="mr-1" /> Rediger profil
              </DavosButton>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <DavosButton variant="outline" size="sm" onClick={sendPasswordReset} disabled={loading === "reset"}>
                {loading === "reset" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Key size={14} className="mr-1" />}
                Passord-reset
              </DavosButton>
              <DavosButton variant="outline" size="sm" onClick={sendPushNotification} disabled={loading === "push"}>
                {loading === "push" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Bell size={14} className="mr-1" />}
                Send push
              </DavosButton>
              <DavosButton variant="outline" size="sm" onClick={() => onAdjustTokens(u.id)}>
                <Coins size={14} className="mr-1" /> Juster tokens
              </DavosButton>
              <DavosButton
                variant={u.is_active ? "outline" : "primary"}
                size="sm"
                onClick={toggleActive}
                disabled={loading === "toggle" || u.id === currentUserId}
              >
                {loading === "toggle" ? <Loader2 size={14} className="animate-spin mr-1" /> :
                  u.is_active ? <UserX size={14} className="mr-1 text-destructive" /> : <UserCheck size={14} className="mr-1" />
                }
                {u.is_active ? "Deaktiver" : "Aktiver"}
              </DavosButton>
              <DavosButton
                variant={u.is_banned ? "primary" : "outline"}
                size="sm"
                onClick={toggleBan}
                disabled={loading === "ban" || u.id === currentUserId}
              >
                {loading === "ban" ? <Loader2 size={14} className="animate-spin mr-1" /> :
                  u.is_banned ? <UserCheck size={14} className="mr-1" /> : <ShieldOff size={14} className="mr-1 text-destructive" />
                }
                {u.is_banned ? "Opphev ban" : "Utesteng"}
              </DavosButton>
              <DavosButton variant="outline" size="sm" onClick={() => setShowNotes(!showNotes)}>
                <StickyNote size={14} className="mr-1" /> Notater
              </DavosButton>

              {/* Delete user – full removal */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DavosButton
                    variant="outline"
                    size="sm"
                    disabled={u.id === currentUserId || loading === "delete"}
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    {loading === "delete" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
                    Slett bruker
                  </DavosButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slett bruker permanent?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{u.nickname || u.full_name || u.email}</strong> vil bli fullstendig fjernet.
                      De må registrere seg på nytt og akseptere vilkårene for å bruke appen igjen.
                      Denne handlingen kan ikke angres.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteUser}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Ja, slett bruker
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Admin notes */}
            {showNotes && (
              <div className="space-y-2 border-t border-border pt-2">
                <div className="flex gap-2">
                  <DavosInput placeholder="Legg til notat..." value={newNote} onChange={e => setNewNote(e.target.value)} className="flex-1" />
                  <DavosButton size="sm" onClick={addNote} disabled={!newNote.trim() || loading === "note"}>
                    {loading === "note" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </DavosButton>
                </div>
                {notes.map(n => (
                  <div key={n.id} className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-foreground">{n.note}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
                {notes.length === 0 && <p className="text-[10px] text-muted-foreground text-center">Ingen notater</p>}
              </div>
            )}
          </div>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
