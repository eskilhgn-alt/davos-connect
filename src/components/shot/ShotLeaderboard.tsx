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
          {/* Header */}
          <div className="grid grid-cols-6 gap-1 text-[10px] text-muted-foreground font-medium px-2 pb-1">
            <span className="col-span-2">Navn</span>
            <span className="text-center">🎯</span>
            <span className="text-center">✅</span>
            <span className="text-center">💀</span>
            <span className="text-center">🔴</span>
          </div>
          {data.map((entry, i) => (
            <div
              key={entry.user_id}
              className="grid grid-cols-6 gap-1 items-center py-2 px-2 border-b border-border last:border-0"
            >
              <span className="col-span-2 text-sm font-medium text-foreground truncate">
                {i + 1}. {entry.display_name}
              </span>
              <span className="text-center text-sm tabular-nums">{entry.times_selected}</span>
              <span className="text-center text-sm tabular-nums">{entry.times_confirmed}</span>
              <span className="text-center text-sm tabular-nums">{entry.times_punished}</span>
              <span className="text-center text-sm tabular-nums">{entry.times_started}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
