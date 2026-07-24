/**
 * useActiveTrip
 * ----------------------------------------------------------------------------
 * Sentralt uttrekk av aktiv tur og turmedlemskap for GüttaHütte. Alle
 * turfølsomme lister (chat, stories, galleri, agenda, avstemminger og utlegg)
 * skal filtrere på `activeTrip.id` fra denne hooken. Ingen komponent skal
 * lenger hardkode Val Thorens- eller Davos-verdier.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Trip {
  id: string;
  name: string;
  destination: string;
  country: string | null;
  timezone: string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "archived";
  destination_config: Record<string, unknown>;
}

async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips" as never)
    .select("*")
    .order("status", { ascending: true })
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as Trip[];
}

export function useActiveTrip() {
  const { user } = useAuth();
  const enabled = !!user;

  const query = useQuery({
    queryKey: ["trips", "list"],
    queryFn: fetchTrips,
    enabled,
    staleTime: 60_000,
  });

  const trips = query.data ?? [];
  const activeTrip = React.useMemo(
    () => trips.find((t) => t.status === "active") ?? null,
    [trips],
  );

  return {
    trips,
    activeTrip,
    activeTripId: activeTrip?.id ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
