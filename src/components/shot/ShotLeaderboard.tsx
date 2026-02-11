/**
 * ShotLeaderboard – Detailed stats from shot_events aligned with game rules
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  times_selected: number;
  times_confirmed: number;
  times_punished: number;
  times_started: number;
  times_witnessed: number;
  times_refused: number;
}

interface ShotLeaderboardProps {
  groupId: string;
}

export const ShotLeaderboard: React.FC<ShotLeaderboardProps> = ({ groupId }) => {
  const [tab, setTab] = React.useState<"week" | "total">("total");
  const [data, setData] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);

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
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Ingen data ennå
        </p>
      ) : (
        <div className="space-y-1.5">
          {data.map((entry, i) => {
            const successRate = entry.times_selected > 0
              ? Math.round(100 * entry.times_confirmed / entry.times_selected)
              : 0;
            const isOpen = expanded === entry.user_id;

            return (
              <button
                key={entry.user_id}
                type="button"
                onClick={() => setExpanded(isOpen ? null : entry.user_id)}
                className="w-full text-left rounded-xl border border-border bg-muted/20 p-3 transition-all active:scale-[0.98]"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {/* Summary row */}
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    i === 0 ? "bg-primary/15 text-primary" :
                    i === 1 ? "bg-foreground/10 text-foreground" :
                    i === 2 ? "bg-foreground/5 text-muted-foreground" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{entry.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      🎯 {entry.times_selected} trukket · ✅ {entry.times_confirmed} tatt · 💀 {entry.times_punished} straffet
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-lg font-heading font-bold leading-none",
                      successRate >= 80 ? "text-success" :
                      successRate >= 50 ? "text-foreground" :
                      "text-destructive"
                    )}>
                      {successRate}%
                    </p>
                    <p className="text-[9px] text-muted-foreground">tatt</p>
                  </div>
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-x-4 gap-y-2">
                    <StatRow emoji="🎯" label="Trukket ut" value={entry.times_selected} />
                    <StatRow emoji="✅" label="Shots tatt" value={entry.times_confirmed} />
                    <StatRow emoji="💀" label="Straffet (ban)" value={entry.times_punished} />
                    <StatRow emoji="🙅" label="Nektet" value={entry.times_refused || 0} />
                    <StatRow emoji="🔴" label="Startet runder" value={entry.times_started} />
                    <StatRow emoji="👁" label="Vært vitne" value={entry.times_witnessed} />
                    <div className="col-span-2 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Suksessrate</span>
                        <span className="font-semibold text-foreground">{successRate}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            successRate >= 80 ? "bg-success" :
                            successRate >= 50 ? "bg-primary" :
                            "bg-destructive"
                          )}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

const StatRow: React.FC<{ emoji: string; label: string; value: number }> = ({ emoji, label, value }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-xs">{emoji}</span>
    <span className="text-xs text-muted-foreground flex-1">{label}</span>
    <span className="text-xs font-semibold text-foreground">{value}</span>
  </div>
);
