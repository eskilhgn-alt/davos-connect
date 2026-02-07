/**
 * useUserLocations — subscribes to all user positions in realtime
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserLocation {
  user_id: string;
  lat: number;
  lon: number;
  updated_at: string;
  display_name?: string;
}

export function useUserLocations() {
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial + join with profiles for display names
    const fetchAll = async () => {
      const { data } = await supabase
        .from("user_locations")
        .select("user_id, lat, lon, updated_at");

      if (data) {
        // Fetch profiles for names
        const userIds = data.map((d) => d.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nickname, full_name")
          .in("id", userIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [p.id, p.nickname || p.full_name || "Ukjent"])
        );

        setLocations(
          data.map((d) => ({
            ...d,
            display_name: profileMap.get(d.user_id) || "Ukjent",
          }))
        );
      }
      setLoading(false);
    };

    fetchAll();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("user-locations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations" },
        () => {
          // Refetch all on any change (simple approach)
          fetchAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { locations, loading };
}
