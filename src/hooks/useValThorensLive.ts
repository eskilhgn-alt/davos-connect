/**
 * useValThorensLive — live heis-/løypestatus for VALGT tur.
 *
 * Kontrakt:
 *  - `scope` er en identitet bygget av tur + live-provider. Cachen er bundet
 *    til den identiteten, så en annen valgt tur/konfigurasjon aldri viser en
 *    annen turs live-data.
 *  - Svar fra en gammel identitet forkastes (generation + identitetssjekk).
 */
import * as React from "react";
import {
  fetchValThorensLive,
  isValThorensCacheFresh,
  readValThorensLiveCache,
  type ValThorensLiveData,
} from "@/services/valThorensLive";

export function useValThorensLive(enabled = true, scope = "") {
  const active = enabled && Boolean(scope);
  const [data, setData] = React.useState<ValThorensLiveData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef<Promise<ValThorensLiveData> | null>(null);
  const generation = React.useRef(0);
  const currentScope = React.useRef<string>("");

  const refresh = React.useCallback(async (): Promise<ValThorensLiveData | undefined> => {
    if (!active) return undefined;
    if (inFlight.current) return inFlight.current;
    const myGen = ++generation.current;
    const myScope = scope;
    setLoading(true);
    setError(null);
    const accept = () => generation.current === myGen && currentScope.current === myScope;
    const request = fetchValThorensLive(myScope)
      .then((next) => {
        if (accept()) setData(next);
        return next;
      })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : "Kunne ikke hente live-data";
        if (accept()) setError(message);
        const fallback = readValThorensLiveCache(myScope);
        if (fallback) {
          const stale = { ...fallback.data, stale: true };
          if (accept()) setData(stale);
          return stale;
        }
        throw reason;
      })
      .finally(() => {
        inFlight.current = null;
        if (generation.current === myGen) setLoading(false);
      });
    inFlight.current = request;
    return request;
  }, [active, scope]);

  React.useEffect(() => {
    generation.current += 1;
    currentScope.current = scope;
    if (!active) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = readValThorensLiveCache(scope);
    setData(cached?.data ?? null);
    setError(null);
    setLoading(!cached);
    if (!isValThorensCacheFresh(cached)) {
      void refresh().catch(() => undefined);
    } else {
      setLoading(false);
    }
    const handleOnline = () => void refresh().catch(() => undefined);
    const handleVisible = () => {
      if (
        document.visibilityState === "visible" &&
        !isValThorensCacheFresh(readValThorensLiveCache(scope))
      ) {
        void refresh().catch(() => undefined);
      }
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [scope, active, refresh]);

  return { data: active ? data : null, loading: active ? loading : false, error: active ? error : null, refresh, enabled: active };
}

/** Deterministisk identitet for live-status: tur + provider. */
export function liveScope(tripId: string | null | undefined, provider: string | null): string {
  if (!tripId || !provider) return "";
  return `${tripId}:${provider}`;
}
