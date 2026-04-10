/**
 * useStreak — computes consecutive active days based on points_ledger activity
 * An "active day" = at least 1 entry in points_ledger for that day
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  loading: boolean;
}

export function useStreak(): StreakData {
  const { user } = useAuth();
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const compute = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      // Get all activity-related data for this user from multiple sources
      const [messagesRes, galleryRes, shotRes, storiesRes] = await Promise.all([
        supabase.from("messages").select("created_at").eq("sender_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        supabase.from("gallery_items").select("created_at").eq("uploaded_by", user.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("shot_events").select("created_at, started_by, selected_user_id, witness_confirmed_by").or(`started_by.eq.${user.id},selected_user_id.eq.${user.id},witness_confirmed_by.eq.${user.id}`).order("created_at", { ascending: false }).limit(200),
        supabase.from("stories").select("created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      ]);

      // Collect all unique active dates
      const activeDays = new Set<string>();
      const addDates = (rows: { created_at: string }[] | null) => {
        rows?.forEach(r => activeDays.add(r.created_at.split("T")[0]));
      };
      addDates(messagesRes.data);
      addDates(galleryRes.data);
      addDates(shotRes.data as any);
      addDates(storiesRes.data);

      // Sort dates descending
      const sorted = Array.from(activeDays).sort().reverse();
      if (sorted.length === 0) {
        setCurrentStreak(0);
        setBestStreak(0);
        setLoading(false);
        return;
      }

      // Calculate current streak (from today backwards)
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      
      let streak = 0;
      let checkDate = activeDays.has(today) ? today : (activeDays.has(yesterday) ? yesterday : null);
      
      if (checkDate) {
        const d = new Date(checkDate);
        while (activeDays.has(d.toISOString().split("T")[0])) {
          streak++;
          d.setDate(d.getDate() - 1);
        }
      }
      setCurrentStreak(streak);

      // Calculate best streak
      let best = 0;
      let current = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
        if (Math.round(diffDays) === 1) {
          current++;
        } else {
          best = Math.max(best, current);
          current = 1;
        }
      }
      best = Math.max(best, current);
      setBestStreak(best);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { compute(); }, [compute]);

  return { currentStreak, bestStreak, loading };
}
