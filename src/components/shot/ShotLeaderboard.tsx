/**
 * ShotLeaderboard – Detailed table-style stats from shot_events aligned with game rules
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

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
  const [sortBy, setSortBy] = React.useState<"selected" | "rate">("selected");
  const [expanded, setExpanded] = React.useState(true);

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

  const sorted = React.useMemo(() => {
    return [...data].sort((a, b) => {
      if (sortBy === "rate") {
        const rateA = a.times_selected > 0 ? a.times_confirmed / a.times_selected : 0;
        const rateB = b.times_selected > 0 ? b.times_confirmed / b.times_selected : 0;
        return rateB - rateA;
      }
      return b.times_selected - a.times_selected;
    });
  }, [data, sortBy]);

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h2 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 size={14} />
          Statistikk
        </h2>
        {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {!expanded ? null : (
        <>
          {/* Tab + sort controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab("week")}
                className={cn("px-3 py-1 text-xs rounded-full transition-colors",
                  tab === "week" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                )}
              >
                Uke
              </button>
              <button
                type="button"
                onClick={() => setTab("total")}
                className={cn("px-3 py-1 text-xs rounded-full transition-colors",
                  tab === "total" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                )}
              >
                Totalt
              </button>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSortBy("selected")}
                className={cn("px-2 py-1 text-[10px] rounded-full transition-colors",
                  sortBy === "selected" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                Mest trukket
              </button>
              <button
                type="button"
                onClick={() => setSortBy("rate")}
                className={cn("px-2 py-1 text-[10px] rounded-full transition-colors",
                  sortBy === "rate" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                Suksessrate
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
            <div className="rounded-xl border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-7 gap-0 bg-muted/60 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <div className="col-span-2">Spiller</div>
                <div className="text-center">🎯</div>
                <div className="text-center">✅</div>
                <div className="text-center">💀</div>
                <div className="text-center">🙅</div>
                <div className="text-center">Rate</div>
              </div>

              {/* Table rows */}
              {sorted.map((entry, i) => {
                const successRate = entry.times_selected > 0
                  ? Math.round(100 * entry.times_confirmed / entry.times_selected)
                  : 0;

                return (
                  <div
                    key={entry.user_id}
                    className={cn(
                      "grid grid-cols-7 gap-0 px-3 py-2.5 items-center border-t border-border/50",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <div className="col-span-2 flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        i === 0 ? "bg-primary/15 text-primary" :
                        i === 1 ? "bg-foreground/10 text-foreground" :
                        i === 2 ? "bg-foreground/5 text-muted-foreground" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-xs font-medium text-foreground truncate">
                        {entry.display_name.split(" ")[0]}
                      </span>
                    </div>
                    <div className="text-center text-xs font-semibold tabular-nums">{entry.times_selected}</div>
                    <div className="text-center text-xs font-semibold tabular-nums text-success">{entry.times_confirmed}</div>
                    <div className="text-center text-xs font-semibold tabular-nums text-destructive">{entry.times_punished}</div>
                    <div className="text-center text-xs font-semibold tabular-nums text-orange-500">{entry.times_refused || 0}</div>
                    <div className="text-center">
                      <span className={cn(
                        "text-xs font-bold tabular-nums",
                        successRate >= 80 ? "text-success" :
                        successRate >= 50 ? "text-foreground" :
                        "text-destructive"
                      )}>
                        {successRate}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Table legend */}
              <div className="bg-muted/40 px-3 py-2 border-t border-border">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  <span>🎯 Trukket ut</span>
                  <span>✅ Tatt (bekreftet)</span>
                  <span>💀 Straffet (ban)</span>
                  <span>🙅 Nektet</span>
                </div>
              </div>
            </div>
          )}

          {/* Extra stats: started rounds + witness duty */}
          {!loading && data.length > 0 && (
            <div className="mt-3 rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-3 gap-0 bg-muted/60 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <div>Spiller</div>
                <div className="text-center">🔴 Startet</div>
                <div className="text-center">👁 Vitne</div>
              </div>
              {sorted.filter(e => e.times_started > 0 || e.times_witnessed > 0).map((entry, i) => (
                <div
                  key={entry.user_id}
                  className={cn(
                    "grid grid-cols-3 gap-0 px-3 py-2 items-center border-t border-border/50",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <span className="text-xs font-medium text-foreground truncate">{entry.display_name.split(" ")[0]}</span>
                  <div className="text-center text-xs font-semibold tabular-nums">{entry.times_started}</div>
                  <div className="text-center text-xs font-semibold tabular-nums">{entry.times_witnessed}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
