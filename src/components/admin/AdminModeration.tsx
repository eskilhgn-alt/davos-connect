/**
 * AdminModeration – Content moderation: stories, gallery, agenda
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandButton } from "@/components/ui/brand-button";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import {
  Image, Film, Calendar, Trash2, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { AdminUser } from "./useAdminData";

interface Props {
  users: AdminUser[];
  currentUserId: string;
  onLogAction: (adminId: string, action: string, targetUserId?: string, details?: Record<string, any>) => void;
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
    const [storiesRes, galleryRes, agendaRes] = await Promise.all([
      supabase.from("stories").select("id, user_id, type, created_at, expires_at, storage_path").order("created_at", { ascending: false }).limit(30),
      supabase.from("gallery_items").select("id, uploaded_by, type, created_at, storage_path").order("created_at", { ascending: false }).limit(50),
      supabase.from("agenda_events").select("id, title, start_at, end_at, created_by").order("start_at", { ascending: false }).limit(20),
    ]);

    setStories(storiesRes.data || []);
    setGallery(galleryRes.data || []);
    setAgenda(agendaRes.data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { loadAll(); }, [loadAll]);

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
        {Array.from({ length: 4 }).map((_, i) => <BrandSkeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const activeStories = stories.filter(s => new Date(s.expires_at) > new Date());

  return (
    <div ref={ref} className="px-4 space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-foreground text-sm">Innholdsmoderering</h3>
        <BrandButton variant="ghost" size="sm" onClick={loadAll}><RefreshCw size={14} /></BrandButton>
      </div>

      {/* Stories */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
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
                <BrandButton variant="ghost" size="sm" onClick={() => deleteStory(s.id)}
                  disabled={actionLoading === `story-${s.id}`} className="text-destructive">
                  {actionLoading === `story-${s.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </BrandButton>
              </div>
            ))
          )}
        </BrandCardContent>
      </BrandCard>

      {/* Gallery */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
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
                <BrandButton variant="ghost" size="sm" onClick={() => deleteGalleryItem(g.id)}
                  disabled={actionLoading === `gallery-${g.id}`} className="text-destructive">
                  {actionLoading === `gallery-${g.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </BrandButton>
              </div>
            ))
          )}
        </BrandCardContent>
      </BrandCard>

      {/* Agenda */}
      <BrandCard>
        <BrandCardContent className="p-4 space-y-3">
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
                <BrandButton variant="ghost" size="sm" onClick={() => deleteAgendaEvent(a.id)}
                  disabled={actionLoading === `agenda-${a.id}`} className="text-destructive">
                  {actionLoading === `agenda-${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </BrandButton>
              </div>
            ))
          )}
        </BrandCardContent>
      </BrandCard>
    </div>
  );
});
AdminModeration.displayName = "AdminModeration";
