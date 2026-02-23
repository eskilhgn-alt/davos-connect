/**
 * AdminModeration – Content moderation: polls, stories, gallery, agenda
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosBadge } from "@/components/ui/davos-badge";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import {
  BarChart3, Image, Film, Calendar, Trash2, Loader2, RefreshCw,
  Lock, Pin, PinOff, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminUser } from "./useAdminData";

interface Props {
  users: AdminUser[];
  currentUserId: string;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
}

interface PollItem {
  id: string;
  question: string;
  status: string;
  created_by: string;
  created_at: string;
  is_pinned: boolean;
  _voteCount?: number;
}

interface StoryItem {
  id: string;
  user_id: string;
  type: string;
  created_at: string;
  expires_at: string;
  storage_path: string;
}

interface GalleryItem {
  id: string;
  uploaded_by: string;
  type: string;
  created_at: string;
  storage_path: string;
}

interface AgendaItem {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  created_by: string;
}

export const AdminModeration = React.forwardRef<HTMLDivElement, Props>(({ users, currentUserId, onLogAction }, ref) => {
  const [polls, setPolls] = React.useState<PollItem[]>([]);
  const [stories, setStories] = React.useState<StoryItem[]>([]);
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  const [agenda, setAgenda] = React.useState<AgendaItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const getName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.nickname || u?.full_name || u?.email || userId.slice(0, 8);
  };

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    const [pollsRes, storiesRes, galleryRes, agendaRes, votesRes] = await Promise.all([
      supabase.from("polls").select("id, question, status, created_by, created_at, is_pinned").order("created_at", { ascending: false }).limit(30),
      supabase.from("stories").select("id, user_id, type, created_at, expires_at, storage_path").order("created_at", { ascending: false }).limit(30),
      supabase.from("gallery_items").select("id, uploaded_by, type, created_at, storage_path").order("created_at", { ascending: false }).limit(50),
      supabase.from("agenda_events").select("id, title, start_at, end_at, created_by").order("start_at", { ascending: false }).limit(20),
      supabase.from("poll_votes").select("poll_id"),
    ]);

    // Count votes per poll
    const voteMap = new Map<string, number>();
    (votesRes.data || []).forEach((v: any) => {
      voteMap.set(v.poll_id, (voteMap.get(v.poll_id) || 0) + 1);
    });

    setPolls((pollsRes.data || []).map(p => ({ ...p, _voteCount: voteMap.get(p.id) || 0 })));
    setStories(storiesRes.data || []);
    setGallery(galleryRes.data || []);
    setAgenda(agendaRes.data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  const closePoll = async (id: string) => {
    setActionLoading(`poll-close-${id}`);
    try {
      const { error } = await supabase.from("polls").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast.success("Poll lukket");
      onLogAction(currentUserId, "poll_closed", undefined, { poll_id: id });
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const togglePinPoll = async (id: string, pinned: boolean) => {
    setActionLoading(`poll-pin-${id}`);
    try {
      const { error } = await supabase.from("polls").update({ is_pinned: !pinned }).eq("id", id);
      if (error) throw error;
      toast.success(pinned ? "Poll frigjort" : "Poll festet");
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const deletePoll = async (id: string) => {
    if (!confirm("Slett denne pollen permanent?")) return;
    setActionLoading(`poll-del-${id}`);
    try {
      // Delete votes and options first
      await supabase.from("poll_votes").delete().eq("poll_id", id);
      await supabase.from("poll_options").delete().eq("poll_id", id);
      const { error } = await supabase.from("polls").delete().eq("id", id);
      if (error) throw error;
      toast.success("Poll slettet");
      onLogAction(currentUserId, "poll_deleted", undefined, { poll_id: id });
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const deleteStory = async (id: string) => {
    setActionLoading(`story-${id}`);
    try {
      // Delete views and likes first
      await supabase.from("story_views").delete().eq("story_id", id);
      await supabase.from("story_likes").delete().eq("story_id", id);
      const { error } = await supabase.from("stories").delete().eq("id", id);
      if (error) throw error;
      toast.success("Story slettet");
      onLogAction(currentUserId, "story_deleted", undefined, { story_id: id });
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const deleteGalleryItem = async (id: string) => {
    setActionLoading(`gallery-${id}`);
    try {
      const { error } = await supabase.from("gallery_items").delete().eq("id", id);
      if (error) throw error;
      toast.success("Bilde slettet fra galleri");
      onLogAction(currentUserId, "gallery_item_deleted", undefined, { item_id: id });
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const deleteAgendaEvent = async (id: string) => {
    setActionLoading(`agenda-${id}`);
    try {
      const { error } = await supabase.from("agenda_events").delete().eq("id", id);
      if (error) throw error;
      toast.success("Hendelse slettet");
      onLogAction(currentUserId, "agenda_deleted", undefined, { event_id: id });
      loadAll();
    } catch (e: any) {
      errorToast("Feil", { description: e.message });
    } finally { setActionLoading(null); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div className="px-4 space-y-3 pb-6">
        {Array.from({ length: 4 }).map((_, i) => <DavosSkeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const activePolls = polls.filter(p => p.status === "active");
  const activeStories = stories.filter(s => new Date(s.expires_at) > new Date());

  return (
    <div ref={ref} className="px-4 space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-foreground text-sm">Innholdsmoderering</h3>
        <DavosButton variant="ghost" size="sm" onClick={loadAll}><RefreshCw size={14} /></DavosButton>
      </div>

      {/* Polls */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h4 className="font-heading font-semibold text-sm text-foreground">Polls ({activePolls.length} aktive)</h4>
          </div>
          {activePolls.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Ingen aktive polls</p>
          ) : (
            activePolls.map(p => (
              <div key={p.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{p.question}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {getName(p.created_by)} · {p._voteCount} stemmer · {fmtDate(p.created_at)}
                  </p>
                  {p.is_pinned && <DavosBadge variant="accent" className="text-[9px] mt-0.5">📌 Festet</DavosBadge>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <DavosButton variant="ghost" size="sm" onClick={() => togglePinPoll(p.id, p.is_pinned)}
                    disabled={actionLoading === `poll-pin-${p.id}`}>
                    {p.is_pinned ? <PinOff size={12} /> : <Pin size={12} />}
                  </DavosButton>
                  <DavosButton variant="ghost" size="sm" onClick={() => closePoll(p.id)}
                    disabled={actionLoading === `poll-close-${p.id}`}>
                    {actionLoading === `poll-close-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                  </DavosButton>
                  <DavosButton variant="ghost" size="sm" onClick={() => deletePoll(p.id)}
                    disabled={actionLoading === `poll-del-${p.id}`} className="text-destructive">
                    {actionLoading === `poll-del-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </DavosButton>
                </div>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>

      {/* Stories */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Film size={16} className="text-primary" />
            <h4 className="font-heading font-semibold text-sm text-foreground">Stories ({activeStories.length} aktive)</h4>
          </div>
          {activeStories.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Ingen aktive stories</p>
          ) : (
            activeStories.map(s => (
              <div key={s.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{getName(s.user_id)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.type} · {fmtDate(s.created_at)}</p>
                </div>
                <DavosButton variant="ghost" size="sm" onClick={() => deleteStory(s.id)}
                  disabled={actionLoading === `story-${s.id}`} className="text-destructive">
                  {actionLoading === `story-${s.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </DavosButton>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>

      {/* Gallery */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Image size={16} className="text-primary" />
            <h4 className="font-heading font-semibold text-sm text-foreground">Galleri ({gallery.length} nyeste)</h4>
          </div>
          {gallery.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Tomt galleri</p>
          ) : (
            gallery.slice(0, 15).map(g => (
              <div key={g.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{getName(g.uploaded_by)}</p>
                  <p className="text-[10px] text-muted-foreground">{g.type} · {fmtDate(g.created_at)}</p>
                </div>
                <DavosButton variant="ghost" size="sm" onClick={() => deleteGalleryItem(g.id)}
                  disabled={actionLoading === `gallery-${g.id}`} className="text-destructive">
                  {actionLoading === `gallery-${g.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </DavosButton>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>

      {/* Agenda */}
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h4 className="font-heading font-semibold text-sm text-foreground">Agenda ({agenda.length})</h4>
          </div>
          {agenda.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Ingen hendelser</p>
          ) : (
            agenda.slice(0, 10).map(a => (
              <div key={a.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground">{getName(a.created_by)} · {fmtDate(a.start_at)}</p>
                </div>
                <DavosButton variant="ghost" size="sm" onClick={() => deleteAgendaEvent(a.id)}
                  disabled={actionLoading === `agenda-${a.id}`} className="text-destructive">
                  {actionLoading === `agenda-${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </DavosButton>
              </div>
            ))
          )}
        </DavosCardContent>
      </DavosCard>
    </div>
  );
});
AdminModeration.displayName = "AdminModeration";
