/**
 * usePoints — hook for points leaderboard and current user points
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PointsEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  recent_points: number;
}

export function usePoints(days = 9999) {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<PointsEntry[]>([]);
  const [myPoints, setMyPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc("rpc_get_points_leaderboard", { p_days: days });
      const entries = (data as unknown as PointsEntry[] | null) || [];
      setLeaderboard(entries);
      if (user) {
        const me = entries.find(e => e.user_id === user.id);
        setMyPoints(me?.total_points ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [days, user]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("points-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_points" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { leaderboard, myPoints, loading, refresh: load };
}
