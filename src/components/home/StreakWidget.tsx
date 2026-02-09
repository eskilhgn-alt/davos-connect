/**
 * StreakWidget — shows global streak leaderboard + current user streak on home screen
 */
import * as React from "react";
import { useStreak } from "@/hooks/useStreak";
import { useGlobalStreaks } from "@/hooks/useGlobalStreaks";
import { useAuth } from "@/contexts/AuthContext";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

export const StreakWidget: React.FC = () => {
  const { currentStreak, bestStreak, loading: myLoading } = useStreak();
  const { streaks, loading: globalLoading } = useGlobalStreaks();
  const { user } = useAuth();

  const loading = myLoading || globalLoading;

  // Don't show if no streaks at all
  if (!loading && streaks.length === 0 && currentStreak === 0) return null;

  const top3 = streaks.slice(0, 3);
  const myRank = streaks.findIndex(s => s.user_id === user?.id) + 1;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Flame size={18} className="text-primary" />
        <h3 className="font-heading text-sm font-semibold text-foreground">Streak 🔥</h3>
      </div>

      {/* Top 3 global streaks */}
      {top3.length > 0 && (
        <div className="space-y-1.5">
          {top3.map((entry, i) => {
            const isMe = entry.user_id === user?.id;
            return (
              <div
                key={entry.user_id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg",
                  isMe && "bg-primary/10"
                )}
              >
                <span className="text-base w-6 text-center">{MEDALS[i]}</span>
                <span className={cn("flex-1 text-sm truncate", isMe ? "font-semibold text-foreground" : "text-foreground")}>
                  {entry.display_name}
                </span>
                <span className="font-mono text-sm font-bold text-foreground flex items-center gap-1">
                  {entry.current_streak}d
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* My streak if not in top 3 */}
      {currentStreak > 0 && myRank > 3 && (
        <div className="pt-2 border-t border-border flex items-center gap-2 px-2">
          <span className="text-xs text-muted-foreground w-6 text-center">#{myRank || "—"}</span>
          <span className="flex-1 text-sm font-semibold text-foreground">Du</span>
          <span className="font-mono text-sm font-bold text-foreground">{currentStreak}d</span>
        </div>
      )}

      {/* My streak summary when no global data */}
      {top3.length === 0 && currentStreak > 0 && (
        <div className="flex items-center gap-3">
          <span className="font-heading text-xl font-bold text-foreground">{currentStreak}</span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {currentStreak === 1 ? "dag streak" : "dager streak"}
            </p>
            <p className="text-xs text-muted-foreground">Rekord: {bestStreak}d</p>
          </div>
        </div>
      )}
    </div>
  );
};
