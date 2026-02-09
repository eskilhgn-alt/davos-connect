/**
 * PointsLeaderboardWidget — compact leaderboard widget for home screen
 */
import * as React from "react";
import { usePoints } from "@/hooks/usePoints";
import { useAuth } from "@/contexts/AuthContext";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Trophy, Star, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

export const PointsLeaderboardWidget: React.FC = () => {
  const { leaderboard, myPoints, loading } = usePoints(7);
  const { user } = useAuth();
  const navigate = useNavigate();

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

  if (leaderboard.length === 0) return null;

  const top3 = leaderboard.slice(0, 3);
  const myRank = leaderboard.findIndex(e => e.user_id === user?.id) + 1;

  return (
    <DavosCard className="cursor-pointer active:scale-[0.98] transition-transform" onClick={() => navigate("/shot")}>
      <DavosCardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-sm font-semibold text-foreground">Toppliste (7d)</h3>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>

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
                <span className="font-mono text-sm font-semibold text-foreground flex items-center gap-1">
                  <Star size={12} className="text-primary" />
                  {entry.total_points}
                </span>
              </div>
            );
          })}
        </div>

        {myRank > 3 && (
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-2 px-2">
            <span className="text-xs text-muted-foreground w-6 text-center">#{myRank}</span>
            <span className="flex-1 text-sm font-semibold text-foreground">Du</span>
            <span className="font-mono text-sm font-semibold text-foreground flex items-center gap-1">
              <Star size={12} className="text-primary" />
              {myPoints}
            </span>
          </div>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
