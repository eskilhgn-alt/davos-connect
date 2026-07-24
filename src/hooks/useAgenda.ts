import * as React from "react";
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
  const [error, setError] = useState<string | null>(null);

  const weekStart = React.useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset],
  );
  const weekEnd = React.useMemo(
    () => endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset],
  );

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("agenda_events")
      .select("*")
      .gte("start_at", weekStart.toISOString())
      .lte("start_at", weekEnd.toISOString())
      .order("start_at");
    if (fetchError) {
      setError("Kunne ikke laste agendaen");
    } else {
      setEvents((data as AgendaEvent[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, [user, weekStart, weekEnd]);

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
    const { error: createError } = await supabase.from("agenda_events").insert({
      title,
      description: description || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      color,
      created_by: user.id,
    });
    if (createError) throw createError;
  };

  const updateEvent = async (id: string, updates: Partial<{ title: string; description: string; start_at: string; end_at: string; color: string }>) => {
    const { error: updateError } = await supabase.from("agenda_events").update(updates).eq("id", id);
    if (updateError) throw updateError;
  };

  const deleteEvent = async (id: string) => {
    const { error: deleteError } = await supabase.from("agenda_events").delete().eq("id", id);
    if (deleteError) throw deleteError;
  };

  return {
    events,
    loading,
    error,
    weekStart,
    weekEnd,
    weekOffset,
    setWeekOffset,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
