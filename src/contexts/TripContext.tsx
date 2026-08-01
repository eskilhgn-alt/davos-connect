/**
 * TripContext — den ene, delte sannheten for hvilken tur brukeren ser.
 *
 * Kontrakt:
 *  - `activeTrip` = turen som er markert `status='active'` i databasen.
 *  - `selectedTrip` = turen brukeren for øyeblikket ser på i UI. Alle
 *    turfølsomme queries, mutasjoner og Realtime-kanaler MÅ bruke
 *    `selectedTripId`. Ingen skjult fallback til aktiv tur i klientkode.
 *  - Persisteres i `localStorage` per bruker, men valideres alltid mot
 *    `trip_members` før den brukes. Ugyldig valg → fallback til aktiv tur.
 *  - `isArchive` = valgt tur er ikke aktiv → composer/opplasting/oppretting
 *    skal skjules eller deaktiveres. DB håndhever samme regel som backstop
 *    via RESTRICTIVE-policy på alle turfølsomme tabeller.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Trip } from "@/hooks/useActiveTrip";

interface TripContextValue {
  trips: Trip[];
  activeTrip: Trip | null;
  selectedTrip: Trip | null;
  selectedTripId: string | null;
  isArchive: boolean;
  isLoading: boolean;
  /** Bytt tur — validerer medlemskap, tømmer turspesifikke cacher og
   *  invaliderer alle turfølsomme queries. */
  selectTrip: (tripId: string) => Promise<void>;
  /** Koordinert refresh: invaliderer bare kritiske, turspesifikke queries
   *  og venter på at de er ferdige. Erstatter component-remount. */
  refreshTrip: () => Promise<void>;
  /** Tvinger ny lesing av turer/medlemskap fra databasen (etter adminlagring). */
  reloadTrips: () => Promise<void>;
}

const TripContext = React.createContext<TripContextValue | undefined>(undefined);

const storageKey = (uid: string) => `guttahutte.selectedTrip.${uid}`;

/** Query-keys som er turspesifikke og bør invalideres ved turbytte/refresh. */
export const TRIP_SCOPED_QUERY_KEYS = [
  "agenda",
  "stories",
  "gallery",
  "polls",
  "rounds",
  "chat",
  "messages",
  "unread",
  "badges",
] as const;

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [trips, setTrips] = React.useState<Trip[]>([]);
  const [memberOf, setMemberOf] = React.useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadTripsAndMembership = React.useCallback(async () => {
    if (!user) {
      setTrips([]);
      setMemberOf(new Set());
      setSelectedId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [{ data: tripsData }, { data: memberships }] = await Promise.all([
      supabase.from("trips" as never).select("*"),
      supabase.from("trip_members" as never).select("trip_id").eq("user_id", user.id),
    ]);
    const list = ((tripsData ?? []) as unknown as Trip[]);
    const memSet = new Set<string>(
      ((memberships ?? []) as { trip_id: string }[]).map((r) => r.trip_id),
    );
    setTrips(list);
    setMemberOf(memSet);

    const active = list.find((t) => t.status === "active") ?? null;
    let initial: string | null = null;
    try {
      const stored = localStorage.getItem(storageKey(user.id));
      if (stored && memSet.has(stored) && list.some((t) => t.id === stored)) {
        initial = stored;
      }
    } catch {
      /* Safari private mode */
    }
    setSelectedId(initial ?? active?.id ?? null);
    setIsLoading(false);
  }, [user]);

  React.useEffect(() => {
    void loadTripsAndMembership();
  }, [loadTripsAndMembership]);

  const selectedTrip = React.useMemo(
    () => trips.find((t) => t.id === selectedId) ?? null,
    [trips, selectedId],
  );
  const activeTrip = React.useMemo(
    () => trips.find((t) => t.status === "active") ?? null,
    [trips],
  );

  const invalidateTripScoped = React.useCallback(async () => {
    await Promise.all(
      TRIP_SCOPED_QUERY_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    );
  }, [queryClient]);

  const selectTrip = React.useCallback(
    async (tripId: string) => {
      if (!user) return;
      if (!memberOf.has(tripId)) throw new Error("Ikke medlem av denne turen");
      try {
        localStorage.setItem(storageKey(user.id), tripId);
      } catch {
        /* ignore */
      }
      // Tøm bare turspesifikke cacher før vi bytter id, så gammel tur ikke
      // vises kort under bytting.
      await Promise.all(
        TRIP_SCOPED_QUERY_KEYS.map((k) => queryClient.removeQueries({ queryKey: [k] })),
      );
      setSelectedId(tripId);
    },
    [user, memberOf, queryClient],
  );

  const refreshTrip = React.useCallback(async () => {
    await invalidateTripScoped();
  }, [invalidateTripScoped]);

  const value: TripContextValue = {
    trips,
    activeTrip,
    selectedTrip,
    selectedTripId: selectedId,
    isArchive: !!selectedTrip && selectedTrip.status !== "active",
    isLoading,
    selectTrip,
    refreshTrip,
    reloadTrips: loadTripsAndMembership,
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
};

export function useTrip(): TripContextValue {
  const ctx = React.useContext(TripContext);
  if (!ctx) throw new Error("useTrip må brukes innenfor TripProvider");
  return ctx;
}

/** Kortversjon når komponenten bare trenger id-en. */
export function useTripId(): string | null {
  return useTrip().selectedTripId;
}

/** True når UI må vise arkivmodus (skrivebeskyttet). */
export function useIsArchive(): boolean {
  return useTrip().isArchive;
}
