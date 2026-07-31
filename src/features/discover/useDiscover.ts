/**
 * useDiscover — henter delt anbefalingsdata for VALGT tur.
 *
 * Kontrakt:
 *  - Klienten sender kun `tripId` + `category`. Aldri koordinater.
 *  - Race/generation-guard: resultat fra tur A forkastes etter bytte til B.
 *  - Den DELTE cachen bor på serveren (`discover_place_cache`, service role).
 *    Denne modulens Map er kun en kortlevd lokal memoisering per fane for å
 *    unngå duplikate kall — den er ikke, og skal ikke fremstilles som, delt.
 *  - Arkiverte turer henter aldri dynamisk providerfeed.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";
import { orderPlaces } from "./guttaMatch";
import type { DiscoverCategory, DiscoverPlace, DiscoverResponse } from "./types";

type CacheEntry = { at: number; data: DiscoverResponse };
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function discoverCacheKey(tripId: string, category: DiscoverCategory): string {
  return `${tripId}:${category}`;
}

/** Eksponert for tester. */
export function clearDiscoverCache() {
  cache.clear();
}

export interface UseDiscoverResult {
  places: DiscoverPlace[];
  provider: string | null;
  attribution: string | null;
  loading: boolean;
  /** Feilkode fra funksjonen, f.eks. `provider_not_configured`. */
  error: string | null;
  /** True når turen mangler verifisert destinasjonssenter. */
  notConfigured: boolean;
  /** True når valgt tur er arkivert — skrivebeskyttet, ingen dynamisk feed. */
  archived: boolean;
  refetch: () => Promise<void>;
}

export function useDiscover(category: DiscoverCategory): UseDiscoverResult {
  const { selectedTrip, selectedTripId } = useTrip();
  const destination = React.useMemo(() => resolveDestination(selectedTrip), [selectedTrip]);
  const archived = selectedTrip ? selectedTrip.status !== "active" : false;

  const [state, setState] = React.useState<{
    places: DiscoverPlace[];
    provider: string | null;
    attribution: string | null;
  }>({ places: [], provider: null, attribution: null });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const generation = React.useRef(0);

  const load = React.useCallback(
    async (force: boolean) => {
      const tripId = selectedTripId;
      // Arkivgrense: aldri dynamisk providerfeed for en arkivert tur.
      if (archived) {
        setState({ places: [], provider: null, attribution: null });
        setError(null);
        setLoading(false);
        return;
      }
      if (!tripId || !destination.configured) {
        setState({ places: [], provider: null, attribution: null });
        setError(null);
        setLoading(false);
        return;
      }
      const gen = ++generation.current;
      const key = discoverCacheKey(tripId, category);
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setState({
          places: sortByGuttaMatch(cached.data.places),
          provider: cached.data.provider,
          attribution: cached.data.attribution,
        });
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const { data, error: fnError } = await supabase.functions.invoke("discover-places", {
        body: { tripId, category },
      });

      // Turen ble byttet mens kallet pågikk → forkast.
      if (gen !== generation.current) return;

      if (fnError || !data) {
        setState({ places: [], provider: null, attribution: null });
        setError((data as { error?: string } | null)?.error ?? "provider_error");
        setLoading(false);
        return;
      }
      const payload = data as DiscoverResponse & { error?: string };
      if (payload.error) {
        setState({ places: [], provider: null, attribution: null });
        setError(payload.error);
        setLoading(false);
        return;
      }
      // Ekstra guard: svaret må gjelde turen vi fortsatt ser på.
      if (payload.tripId !== selectedTripId) return;

      cache.set(key, { at: Date.now(), data: payload });
      setState({
        places: sortByGuttaMatch(payload.places ?? []),
        provider: payload.provider,
        attribution: payload.attribution,
      });
      setLoading(false);
    },
    [selectedTripId, category, destination.configured, archived],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  return {
    places: state.places,
    provider: state.provider,
    attribution: state.attribution,
    loading,
    error,
    notConfigured: !destination.configured,
    archived,
    refetch: () => load(true),
  };
}
