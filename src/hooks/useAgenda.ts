/**
 * useAgenda — turbundet Agenda-datalag.
 *
 * Kontrakt:
 *  - Henter HELE turens tidslinje for `selectedTripId` (ingen ukevindu).
 *  - React Query er eneste kilde, slik at `refreshTrip()`/pull-to-refresh og
 *    Realtime faktisk oppdaterer visningen (`["agenda", tripId]`).
 *  - ALLE mutasjoner er scopet på `trip_id`: en hendelse-ID fra tur A kan
 *    aldri endres eller slettes mens tur B er valgt.
 *  - Arkivert tur er lesbar, men ikke skrivbar.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTrip } from "@/contexts/TripContext";
import { buildTimeline, pickNextEvent, type TimelineDay } from "@/features/agenda/timeline";

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

export const agendaQueryKey = (tripId: string | null) => ["agenda", tripId] as const;

export function useAgenda() {
  const { user } = useAuth();
  const { selectedTripId, selectedTrip, isArchive } = useTrip();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: agendaQueryKey(selectedTripId),
    enabled: !!user && !!selectedTripId,
    staleTime: 30_000,
    queryFn: async (): Promise<AgendaEvent[]> => {
      const { data, error } = await supabase
        .from("agenda_events")
        .select("*")
        .eq("trip_id" as never, selectedTripId as never)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data as AgendaEvent[]) ?? [];
    },
  });

  const events = React.useMemo(() => query.data ?? [], [query.data]);

  // Realtime — strengt filtrert på valgt tur.
  React.useEffect(() => {
    if (!selectedTripId) return;
    const channel = supabase
      .channel(`agenda_realtime_${selectedTripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agenda_events",
          filter: `trip_id=eq.${selectedTripId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: agendaQueryKey(selectedTripId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTripId, queryClient]);

  const timeline: TimelineDay[] = React.useMemo(
    () => buildTimeline(events, selectedTrip),
    [events, selectedTrip],
  );

  const nextEvent = React.useMemo(() => pickNextEvent(events), [events]);

  const refetch = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: agendaQueryKey(selectedTripId) });
  }, [queryClient, selectedTripId]);

  const createEvent = async (
    title: string,
    description: string,
    startAt: Date,
    endAt: Date,
    color: string,
  ) => {
    if (!user || !selectedTripId) throw new Error("Ingen tur valgt");
    if (isArchive) throw new Error("Arkivmodus – kan ikke opprette aktiviteter");
    const { error } = await supabase.from("agenda_events").insert({
      title,
      description: description || null,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      color,
      created_by: user.id,
      trip_id: selectedTripId,
    } as never);
    if (error) throw error;
    await refetch();
  };

  const updateEvent = async (
    id: string,
    updates: Partial<{ title: string; description: string | null; start_at: string; end_at: string; color: string }>,
  ) => {
    if (!selectedTripId) throw new Error("Ingen tur valgt");
    if (isArchive) throw new Error("Arkivmodus – kan ikke endre aktiviteter");
    const { error } = await supabase
      .from("agenda_events")
      .update(updates)
      .eq("id", id)
      .eq("trip_id" as never, selectedTripId as never);
    if (error) throw error;
    await refetch();
  };

  const deleteEvent = async (id: string) => {
    if (!selectedTripId) throw new Error("Ingen tur valgt");
    if (isArchive) throw new Error("Arkivmodus – kan ikke slette aktiviteter");
    const { error } = await supabase
      .from("agenda_events")
      .delete()
      .eq("id", id)
      .eq("trip_id" as never, selectedTripId as never);
    if (error) throw error;
    await refetch();
  };

  return {
    events,
    timeline,
    nextEvent,
    loading: query.isLoading,
    error: query.error ? "Kunne ikke laste agendaen" : null,
    refetch,
    createEvent,
    updateEvent,
    deleteEvent,
    isArchive,
  };
}
