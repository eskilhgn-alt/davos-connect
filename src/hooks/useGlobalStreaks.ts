/**
 * useGlobalStreaks — fetches streak leaderboard from user_streaks table
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StreakEntry {
  user_id: string;
  current_streak: number;
  best_streak: number;
  display_name: string;
}

export function useGlobalStreaks() {
  const [streaks, setStreaks] = useState<StreakEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Fetch streaks and join with profiles for display names
      const { data: streakData } = await supabase
        .from("user_streaks")
        .select("user_id, current_streak, best_streak")
        .gt("current_streak", 0)
        .order("current_streak", { ascending: false })
        .limit(10);

      if (!streakData || streakData.length === 0) {
        setStreaks([]);
        setLoading(false);
        return;
      }

      const userIds = streakData.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p.nickname || p.full_name || "Ukjent"]));

      setStreaks(streakData.map(s => ({
        user_id: s.user_id,
        current_streak: s.current_streak,
        best_streak: s.best_streak,
        display_name: profileMap.get(s.user_id) || "Ukjent",
      })));
      setLoading(false);
    };
    load();
  }, []);

  return { streaks, loading };
}
