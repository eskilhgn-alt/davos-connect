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
import {
  applySavedTripRow,
  mergeReloadedTrips,
  resolveSelectedTripId,
} from "@/features/trip/tripSync";


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
  /**
   * Autoritativ synk av én verifisert lagret trips-rad. Oppdaterer både
   * TripContext og ["trips","list"] umiddelbart, bevarer valgt tur og
   * hindrer at en eldre lesing overskriver raden.
   */
  applySavedTrip: (row: Trip) => Promise<void>;

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

/**
 * Fjerner destinasjonsavhengige lokale cacher for én tur. Nøklene er
 * identitetsbundet (`trip-weather:v2:<tripId>:...`, `guttahutte:live-status:v2:<tripId>:...`),
 * så en configendring gir uansett ny nøkkel — dette rydder bare bort de
 * utdaterte identitetene for samme tur.
 */
export function dropDestinationCaches(tripId: string): void {
  try {
    const prefixes = [`trip-weather:v2:${tripId}:`, `guttahutte:live-status:v2:${tripId}:`];
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Safari private mode */
  }
}

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [trips, setTrips] = React.useState<Trip[]>([]);
  const [memberOf, setMemberOf] = React.useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  /** Monotont generasjonsnummer: eldre lesinger forkastes. */
  const generation = React.useRef(0);
  /** Speil av trips uten å måtte lese state inne i callbacks. */
  const tripsRef = React.useRef<Trip[]>([]);
  React.useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const loadTripsAndMembership = React.useCallback(async () => {
    if (!user) {
      generation.current += 1;
      setTrips([]);
      setMemberOf(new Set());
      setSelectedId(null);
      setIsLoading(false);
      return;
    }
    const gen = ++generation.current;
    setIsLoading(true);
    const [tripsRes, memberRes] = await Promise.all([
      supabase.from("trips" as never).select("*"),
      supabase.from("trip_members" as never).select("trip_id").eq("user_id", user.id),
    ]);
    const stale = gen !== generation.current;
    const ok = !tripsRes.error && !memberRes.error;
    if (stale) return;
    setIsLoading(false);
    if (!ok) return; // Feilet lesing skal aldri tømme eksisterende turer.

    const incoming = (tripsRes.data ?? []) as unknown as Trip[];
    const memSet = new Set<string>(
      ((memberRes.data ?? []) as { trip_id: string }[]).map((r) => r.trip_id),
    );
    setMemberOf(memSet);
    // Medlemslisten er autoritativ: en admin kan lese trips-raden, men skal
    // ikke beholde valgt tur etter medlemskapsrevokering.
    const visible = incoming.filter((t) => memSet.has(t.id));
    const merged = mergeReloadedTrips(tripsRef.current, visible, {
      ok,
      stale: gen !== generation.current,
      membershipAuthoritative: true,
    });
    tripsRef.current = merged;
    setTrips(merged);

    let stored: string | null = null;
    try {
      const s = localStorage.getItem(storageKey(user.id));
      if (s && memSet.has(s) && visible.some((t) => t.id === s)) stored = s;
    } catch {
      /* Safari private mode */
    }
    setSelectedId((prev) => {
      const validPrev = prev && memSet.has(prev) && visible.some((t) => t.id === prev) ? prev : null;
      return resolveSelectedTripId(validPrev ?? stored, visible);
    });
  }, [user]);

  /**
   * Autoritativ, umiddelbar synk av én verifisert lagret rad.
   * Nøyaktig ÉN oppdateringssekvens: context-state, ["trips","list"] og
   * destinasjonsavhengige cacher. Ingen queryClient-sideeffekt inne i en
   * setState-updater (updaters må være rene og kan kjøres flere ganger).
   */
  const applySavedTrip = React.useCallback(
    async (row: Trip) => {
      const gen = ++generation.current; // eldre in-flight lesinger kan ikke rulle tilbake
      const next = applySavedTripRow(tripsRef.current, row);
      tripsRef.current = next;
      setTrips(next);
      queryClient.setQueryData(["trips", "list"], next);
      // Destinasjonsavhengige lokale cacher (vær, live-status) er
      // identitetsbundet til config: rydd bort utdaterte identiteter for
      // denne turen slik at ny config aldri viser gammel data.
      dropDestinationCaches(row.id);

      // En admin-lesbar trips-rad gir ALDRI runtime-tilgang alene. Bare et
      // ferskt, smalt medlemskapsoppslag kan gjøre raden til valgt tur.
      if (user) {
        const known = memberOfRef.current.has(row.id);
        let isMember = known;
        if (!known) {
          const { data, error } = await supabase
            .from("trip_members" as never)
            .select("trip_id")
            .eq("user_id", user.id)
            .eq("trip_id", row.id)
            .maybeSingle();
          isMember = !error && !!data;
        }
        // Et gammelt medlemskapssvar skal aldri overstyre nyere generasjon/bruker.
        if (generation.current === gen) {
          if (isMember) {
            if (!known) {
              setMemberOf((prev) => {
                const s = new Set(prev);
                s.add(row.id);
                return s;
              });
            }
            setSelectedId((prev) => prev ?? row.id);
          }
        }
      }

      await Promise.all(
        TRIP_SCOPED_QUERY_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
      );
    },
    [queryClient, user],
  );



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
    applySavedTrip,

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
