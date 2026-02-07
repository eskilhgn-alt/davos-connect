import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";

export interface AgendaEvent {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  color: string | null;
  created_by: string;
  created_at: string;
}

export function useAgenda() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("agenda_events")
      .select("*")
      .gte("start_at", weekStart.toISOString())
      .lte("start_at", weekEnd.toISOString())
      .order("start_at");
    setEvents((data as AgendaEvent[]) ?? []);
    setLoading(false);
  }, [user, weekOffset]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("agenda_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_events" }, () => {
        fetchEvents();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEvents]);

  const createEvent = async (title: string, description: string, startAt: Date, endAt: Date, color: string) => {
    if (!user) return;
    await supabase.from("agenda_events").insert({
      title,
      description: description || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      color,
      created_by: user.id,
    });
  };

  const updateEvent = async (id: string, updates: Partial<{ title: string; description: string; start_at: string; end_at: string; color: string }>) => {
    await supabase.from("agenda_events").update(updates).eq("id", id);
  };

  const deleteEvent = async (id: string) => {
    await supabase.from("agenda_events").delete().eq("id", id);
  };

  return {
    events,
    loading,
    weekStart,
    weekEnd,
    weekOffset,
    setWeekOffset,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
