/**
 * SkiVerticalCard – Shows today's vertical, cumulative trip total, and weekly leaderboard
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Mountain, Trophy, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  total_vertical: number;
  active_days: number;
  frikort_count: number;
}

interface DailyVertical {
  vertical_meters: number;
  sample_count: number;
}

export const SkiVerticalCard: React.FC = () => {
  const { user } = useAuth();
  const [todayVertical, setTodayVertical] = React.useState<number>(0);
  const [tripTotal, setTripTotal] = React.useState<number>(0);
  const [activeDays, setActiveDays] = React.useState<number>(0);
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    if (!user) return;
    const [todayRes, tripRes, leaderRes] = await Promise.all([
      supabase
        .from("ski_daily_vertical")
        .select("vertical_meters, sample_count")
        .eq("user_id", user.id)
        .eq("day_date", new Date().toISOString().split("T")[0])
        .maybeSingle(),
      // Get ALL-TIME total for current user
      supabase
        .from("ski_daily_vertical")
        .select("vertical_meters, day_date")
        .eq("user_id", user.id),
      supabase.rpc("rpc_get_ski_leaderboard", { p_days: 7 }),
    ]);

    if (todayRes.data) {
      setTodayVertical((todayRes.data as unknown as DailyVertical).vertical_meters);
    }
    if (tripRes.data) {
      const rows = tripRes.data as unknown as { vertical_meters: number; day_date: string }[];
      setTripTotal(rows.reduce((sum, r) => sum + r.vertical_meters, 0));
      setActiveDays(rows.length);
    }
    if (leaderRes.data) {
      setLeaderboard(leaderRes.data as unknown as LeaderboardEntry[]);
    }
    setLoading(false);
  }, [user]);

  React.useEffect(() => { loadData(); }, [loadData]);

  // Realtime updates
  React.useEffect(() => {
    const channel = supabase
      .channel("ski-vertical-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ski_daily_vertical" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  return (
    <section className="space-y-4">
      {/* Today + Trip total */}
      <div className="flex gap-3">
        <div className="flex-1 text-center py-5 rounded-xl border border-border bg-muted/30">
          <Mountain size={22} className="mx-auto text-foreground mb-1" />
          <p className="font-heading text-3xl font-bold text-foreground tabular-nums">
            {loading ? "…" : Math.round(todayVertical)}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">m</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">I dag</p>
        </div>
        <div className="flex-1 text-center py-5 rounded-xl border border-border bg-muted/30">
          <Trophy size={22} className="mx-auto text-foreground mb-1" />
          <p className="font-heading text-3xl font-bold text-foreground tabular-nums">
            {loading ? "…" : Math.round(tripTotal)}
            <span className="text-sm font-normal text-muted-foreground ml-0.5">m</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Totalt · {activeDays} dager
          </p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Kun nedkjøring · over 1500m · 10+ km/t
      </p>

      {/* Weekly leaderboard */}
      {leaderboard.length > 0 && (
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Trophy size={14} />
            Høydemeter – siste 7 dager
          </h3>
          <div className="space-y-0">
            {leaderboard.map((entry, idx) => (
              <div
                key={entry.user_id}
                className={cn(
                  "flex items-center justify-between py-2 px-2 border-b border-border last:border-0",
                  entry.user_id === user?.id && "bg-primary/5 rounded-lg"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium w-5 text-muted-foreground">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`}
                  </span>
                  <span className="text-sm text-foreground truncate">{entry.display_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {entry.frikort_count > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Ticket size={12} />
                      {entry.frikort_count}
                    </span>
                  )}
                  <span className="text-sm font-semibold tabular-nums">
                    {Math.round(entry.total_vertical)}m
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
