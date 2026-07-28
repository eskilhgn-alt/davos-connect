import * as React from "react";
import {
  fetchValThorensLive,
  isValThorensCacheFresh,
  readValThorensLiveCache,
  type ValThorensLiveData,
} from "@/services/valThorensLive";

export function useValThorensLive(enabled = true) {
  const cachedAtMount = React.useMemo(() => readValThorensLiveCache(), []);
  const [data, setData] = React.useState<ValThorensLiveData | null>(cachedAtMount?.data ?? null);
  const [loading, setLoading] = React.useState(enabled && !cachedAtMount);
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef<Promise<ValThorensLiveData> | null>(null);

  const refresh = React.useCallback(async (): Promise<ValThorensLiveData | undefined> => {
    if (!enabled) return undefined;
    if (inFlight.current) return inFlight.current;
    setLoading(true);
    setError(null);
    const request = fetchValThorensLive()
      .then((next) => {
        setData(next);
        return next;
      })
      .catch((reason) => {
        const message = reason instanceof Error ? reason.message : "Kunne ikke hente live-data";
        setError(message);
        const fallback = readValThorensLiveCache();
        if (fallback) {
          const stale = { ...fallback.data, stale: true };
          setData(stale);
          return stale;
        }
        throw reason;
      })
      .finally(() => {
        inFlight.current = null;
        setLoading(false);
      });
    inFlight.current = request;
    return request;
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!isValThorensCacheFresh(cachedAtMount)) {
      void refresh().catch(() => undefined);
    }
    const handleOnline = () => void refresh().catch(() => undefined);
    const handleVisible = () => {
      if (document.visibilityState === "visible" && !isValThorensCacheFresh(readValThorensLiveCache())) {
        void refresh().catch(() => undefined);
      }
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [cachedAtMount, refresh, enabled]);

  return { data: enabled ? data : null, loading: enabled ? loading : false, error: enabled ? error : null, refresh, enabled };
}
