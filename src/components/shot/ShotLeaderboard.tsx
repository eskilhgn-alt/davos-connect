/**
 * ShotLeaderboard – Stats from shot_events
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  times_selected: number;
  times_confirmed: number;
  times_punished: number;
  times_started: number;
  times_witnessed: number;
}

interface ShotLeaderboardProps {
  groupId: string;
}

export const ShotLeaderboard: React.FC<ShotLeaderboardProps> = ({ groupId }) => {
  const [tab, setTab] = React.useState<"week" | "total">("total");
  const [data, setData] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      const days = tab === "week" ? 7 : 9999;
      const { data: result } = await supabase.rpc("rpc_get_shot_leaderboard", {
        p_group_id: groupId,
        p_days: days,
      });
      if (result) {
        setData(result as unknown as LeaderboardEntry[]);
      }
      setLoading(false);
    };
    load();
  }, [groupId, tab]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">
          Statistikk
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("week")}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              tab === "week" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            Uke
          </button>
          <button
            type="button"
            onClick={() => setTab("total")}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              tab === "total" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            Totalt
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Ingen data ennå
        </p>
      ) : (
        <div className="space-y-0">
          {data.map((entry, i) => (
            <div
              key={entry.user_id}
              className="py-3 px-2 border-b border-border last:border-0"
            >
              <p className="text-sm font-medium text-foreground mb-1.5">
                {i + 1}. {entry.display_name}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>🎯 Trukket ut: <strong className="text-foreground">{entry.times_selected}</strong></span>
                <span>✅ Bekreftet: <strong className="text-foreground">{entry.times_confirmed}</strong></span>
                <span>💀 Straffet: <strong className="text-foreground">{entry.times_punished}</strong></span>
                <span>🔴 Startet runder: <strong className="text-foreground">{entry.times_started}</strong></span>
                <span>👁 Vært vitne: <strong className="text-foreground">{entry.times_witnessed}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
