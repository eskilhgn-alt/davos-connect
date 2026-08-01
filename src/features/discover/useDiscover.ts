/**
 * useDiscover — henter delt anbefalingsdata for VALGT tur.
 *
 * Kontrakt:
 *  - Klienten sender kun `tripId` + `category`. Aldri koordinater.
 *  - Race/generation-guard: resultat fra tur A eller config v1 forkastes etter
 *    bytte til B / v2.
 *  - Den DELTE cachen bor på serveren (`discover_place_cache`, service role).
 *    Denne modulens Map er kun en kortlevd lokal memoisering per fane for å
 *    unngå duplikate kall — den er ikke, og skal ikke fremstilles som, delt.
 *  - Lokal cache-key inneholder trip_id + config-versjon + provider + kategori
 *    + filterversjon, slik at endret config aldri gir stale resultat.
 *  - Personlig posisjon inngår aldri i key, ranking eller Gütta-match.
 *  - Arkiverte turer henter aldri dynamisk providerfeed.
 *  - Datoer påvirker aldri om Oppdag er konfigurert.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";
import {
  buildClientCacheKey,
  discoveryError,
  resolveDiscoveryConfig,
  type DiscoveryConfigError,
} from "./discoveryConfig";
import { orderPlaces } from "./guttaMatch";
import type { DiscoverCategory, DiscoverPlace, DiscoverResponse } from "./types";

type CacheEntry = { at: number; data: DiscoverResponse };
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export function discoverCacheKey(
  tripId: string,
  category: DiscoverCategory,
  parts?: { configVersion?: string; provider?: string; filterVersion?: string },
): string {
  return buildClientCacheKey({
    tripId,
    configVersion: parts?.configVersion ?? "none",
    provider: parts?.provider ?? "none",
    category,
    filterVersion: parts?.filterVersion ?? "none",
  });
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
  /** True når turen mangler verifisert destinasjonssenter eller discovery. */
  notConfigured: boolean;
  /** Presis årsak til at Oppdag ikke er konfigurert. */
  notConfiguredReason: DiscoveryConfigError | null;
  /** True når valgt tur er arkivert — skrivebeskyttet, ingen dynamisk feed. */
  archived: boolean;
  refetch: () => Promise<void>;
}

export function useDiscover(category: DiscoverCategory): UseDiscoverResult {
  const { selectedTrip, selectedTripId } = useTrip();
  const destination = React.useMemo(() => resolveDestination(selectedTrip), [selectedTrip]);
  const archived = selectedTrip ? selectedTrip.status !== "active" : false;

  // Config-versjon fra VALGT turs egen destination_config. Datoer inngår ikke.
  const discovery = React.useMemo(
    () => resolveDiscoveryConfig(selectedTrip?.destination_config),
    [selectedTrip?.destination_config],
  );
  const hasCenter = destination.center != null;
  const configVersion = discovery.configured ? discovery.version : null;
  const filterVersion = discovery.configured ? discovery.filterVersion : null;
  const configuredProvider = discovery.configured ? discovery.providers[0] : null;

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
      // Ny generasjon per forsøk: både turbytte og configendring forkaster svar.
      const gen = ++generation.current;
      const reset = () => {
        setState({ places: [], provider: null, attribution: null });
        setError(null);
        setLoading(false);
      };
      // Arkivgrense: aldri dynamisk providerfeed for en arkivert tur.
      if (archived) return reset();
      if (!tripId || !configVersion || !configuredProvider) return reset();

      const key = discoverCacheKey(tripId, category, {
        configVersion,
        provider: configuredProvider,
        filterVersion: filterVersion ?? undefined,
      });
      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
        setState({
          places: orderPlaces(cached.data.places),
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

      // Turen eller configen ble byttet mens kallet pågikk → forkast.
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
        places: orderPlaces(payload.places ?? []),
        provider: payload.provider,
        attribution: payload.attribution,
      });
      setLoading(false);
    },
    [selectedTripId, category, configVersion, filterVersion, configuredProvider, archived],
  );

  React.useEffect(() => {
    void load(false);
  }, [load]);

  const notConfigured = !discovery.configured;
  let notConfiguredReason: DiscoveryConfigError | null = null;
  if (!discovery.configured) {
    notConfiguredReason = hasCenter
      ? discoveryError(discovery)
      : "destination_not_configured";
  }

  return {
    places: state.places,
    provider: state.provider ?? configuredProvider,
    attribution: state.attribution,
    loading,
    error,
    notConfigured,
    notConfiguredReason,
    archived,
    refetch: () => load(true),
  };
}
