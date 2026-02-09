/**
 * AdminUserDetail – Expandable user detail panel for admin management
 * Edit profile, send password reset, manage roles, view activity
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosBadge } from "@/components/ui/davos-badge";
import {
  UserX, UserCheck, Coins, Ticket, Loader2, Key, Save,
  ChevronDown, ChevronUp, Bell, Edit3, Mail, Shield, ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
  avatar_url?: string | null;
  created_at: string;
  role: "user" | "admin";
  token_balance?: number;
  frikort_count?: number;
}

interface Props {
  user: UserProfile;
  currentUserId: string;
  onRefresh: () => void;
  onAdjustTokens: (userId: string) => void;
}

export const AdminUserDetail: React.FC<Props> = ({ user: u, currentUserId, onRefresh, onAdjustTokens }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [loading, setLoading] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState(false);
  const [editName, setEditName] = React.useState(u.full_name || "");
  const [editNickname, setEditNickname] = React.useState(u.nickname || "");

  const toggleActive = async () => {
    setLoading("toggle");
    try {
      await supabase.from("profiles").update({ is_active: !u.is_active }).eq("id", u.id);
      toast.success(u.is_active ? "Bruker deaktivert" : "Bruker aktivert");
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
    } catch (e: any) {
      toast.error(e.message || "Kunne ikke sende reset");
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
    } catch {
      toast.error("Kunne ikke sende push");
    } finally { setLoading(null); }
  };

  return (
    <DavosCard>
      <DavosCardContent className="p-4">
        {/* Header row */}
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start justify-between text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-medium text-foreground truncate">{u.full_name || u.email}</p>
              {u.role === "admin" && <DavosBadge variant="accent">Admin</DavosBadge>}
              {!u.is_active && <DavosBadge variant="critical">Inaktiv</DavosBadge>}
            </div>
            {u.nickname && <p className="text-xs text-muted-foreground">«{u.nickname}»</p>}
            <p className="text-sm text-muted-foreground truncate">{u.email}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Coins size={12} /> {u.token_balance ?? 5} tokens</span>
              {(u.frikort_count ?? 0) > 0 && <span className="flex items-center gap-1"><Ticket size={12} /> {u.frikort_count} frikort</span>}
            </div>
          </div>
          {expanded ? <ChevronUp size={18} className="text-muted-foreground mt-1" /> : <ChevronDown size={18} className="text-muted-foreground mt-1" />}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground">
              Registrert: {new Date(u.created_at).toLocaleDateString("nb-NO")}
            </p>

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

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <DavosButton variant="outline" size="sm" onClick={sendPasswordReset} disabled={loading === "reset"}>
                {loading === "reset" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Key size={14} className="mr-1" />}
                Send passord-reset
              </DavosButton>

              <DavosButton variant="outline" size="sm" onClick={sendPushNotification} disabled={loading === "push"}>
                {loading === "push" ? <Loader2 size={14} className="animate-spin mr-1" /> : <Bell size={14} className="mr-1" />}
                Send push-varsel
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
            </div>
          </div>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
