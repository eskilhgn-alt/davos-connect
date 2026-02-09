/**
 * StreakWidget — shows current streak on home screen
 */
import * as React from "react";
import { useStreak } from "@/hooks/useStreak";
import { Flame } from "lucide-react";

export const StreakWidget: React.FC = () => {
  const { currentStreak, bestStreak, loading } = useStreak();

  if (loading || currentStreak === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
      <div className="flex items-center gap-1.5">
        <Flame size={20} className="text-primary" />
        <span className="font-heading text-xl font-bold text-foreground">{currentStreak}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          {currentStreak === 1 ? "dag streak" : "dager streak"} 🔥
        </p>
        <p className="text-xs text-muted-foreground">Rekord: {bestStreak}d</p>
      </div>
    </div>
  );
};
