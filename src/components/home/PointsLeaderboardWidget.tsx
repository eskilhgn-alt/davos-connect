/**
 * PointsLeaderboardWidget — 3-section widget: streak, today's top, all-time top
 */
import * as React from "react";
import { usePoints } from "@/hooks/usePoints";
import { useGlobalStreaks } from "@/hooks/useGlobalStreaks";
import { useAuth } from "@/contexts/AuthContext";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Trophy, Flame, Star, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

export const PointsLeaderboardWidget: React.FC = () => {
  const { leaderboard: allTimeBoard, loading: loadingAll } = usePoints(9999);
  const { leaderboard: todayBoard, loading: loadingToday } = usePoints(1);
  const { streaks, loading: loadingStreaks } = useGlobalStreaks();
  const { user } = useAuth();
  const navigate = useNavigate();

  const loading = loadingAll || loadingToday || loadingStreaks;

  if (loading) {
    return (
      <DavosCard>
        <DavosCardContent className="p-4">
          <DavosSkeleton className="h-4 w-32 mb-3" />
          <DavosSkeleton className="h-10 w-full mb-2" />
          <DavosSkeleton className="h-10 w-full" />
        </DavosCardContent>
      </DavosCard>
    );
  }

  const topStreaks = streaks.slice(0, 3);
  const topToday = todayBoard.slice(0, 3);
  const topAll = allTimeBoard.slice(0, 3);

  if (topAll.length === 0 && topToday.length === 0 && topStreaks.length === 0) return null;

  return (
    <DavosCard className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate("/tokens")}>
      <DavosCardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-sm font-semibold text-foreground">Topplister</h3>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>

        {/* Streak section */}
        {topStreaks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Flame size={12} className="text-orange-500" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Streak</span>
            </div>
            <div className="space-y-1">
              {topStreaks.map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                return (
                  <div key={entry.user_id} className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", isMe && "bg-primary/10")}>
                    <span className="text-sm w-5 text-center">{MEDALS[i]}</span>
                    <span className={cn("flex-1 text-xs truncate", isMe ? "font-semibold" : "text-foreground")}>{entry.display_name}</span>
                    <span className="font-mono text-xs font-semibold text-foreground">{entry.current_streak}🔥</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today section */}
        {topToday.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star size={12} className="text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">I dag</span>
            </div>
            <div className="space-y-1">
              {topToday.map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                return (
                  <div key={entry.user_id} className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", isMe && "bg-primary/10")}>
                    <span className="text-sm w-5 text-center">{MEDALS[i]}</span>
                    <span className={cn("flex-1 text-xs truncate", isMe ? "font-semibold" : "text-foreground")}>{entry.display_name}</span>
                    <span className="font-mono text-xs font-semibold text-foreground">{entry.recent_points}p</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All-time section */}
        {topAll.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Trophy size={12} className="text-yellow-500" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Totalt</span>
            </div>
            <div className="space-y-1">
              {topAll.map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                return (
                  <div key={entry.user_id} className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", isMe && "bg-primary/10")}>
                    <span className="text-sm w-5 text-center">{MEDALS[i]}</span>
                    <span className={cn("flex-1 text-xs truncate", isMe ? "font-semibold" : "text-foreground")}>{entry.display_name}</span>
                    <span className="font-mono text-xs font-semibold text-foreground">{entry.total_points}p</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
