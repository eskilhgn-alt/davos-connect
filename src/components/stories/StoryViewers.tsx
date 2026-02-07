/**
 * StoryViewers - Shows who viewed a story (for story owner)
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye } from "lucide-react";

interface Viewer {
  userId: string;
  name: string;
  viewedAt: string;
}

interface StoryViewersProps {
  storyId: string;
  isOwner: boolean;
}

export const StoryViewers: React.FC<StoryViewersProps> = ({ storyId, isOwner }) => {
  const [viewers, setViewers] = React.useState<Viewer[]>([]);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!isOwner) return;

    const fetch = async () => {
      const { data: views } = await supabase
        .from("story_views")
        .select("user_id, viewed_at")
        .eq("story_id", storyId);

      if (!views || views.length === 0) {
        setViewers([]);
        return;
      }

      const userIds = views.map((v: any) => v.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", userIds);

      const profileMap = new Map<string, string>();
      for (const p of (profiles || []) as any[]) {
        profileMap.set(p.id, p.nickname || p.full_name || "Ukjent");
      }

      setViewers(
        views.map((v: any) => ({
          userId: v.user_id,
          name: profileMap.get(v.user_id) || "Ukjent",
          viewedAt: v.viewed_at,
        }))
      );
    };

    fetch();
  }, [storyId, isOwner]);

  if (!isOwner) return null;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-t from-black/80 to-transparent text-white text-sm"
      >
        <Eye size={16} />
        <span>{viewers.length} visninger</span>
      </button>

      {expanded && viewers.length > 0 && (
        <div className="bg-black/90 backdrop-blur-md px-4 pb-6 pt-2 max-h-48 overflow-y-auto">
          {viewers.map((v) => (
            <div key={v.userId} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
              <span className="text-white text-sm font-medium">{v.name}</span>
              <span className="text-white/50 text-xs">
                {new Date(v.viewedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
