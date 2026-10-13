import * as React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTrip } from "@/contexts/TripContext";
import { supabase } from "@/integrations/supabase/client";
import { socialApi, socialError } from "./api";
import type { SocialCommand, SocialState } from "./types";

interface Value {
  state: SocialState | null;
  receivedAt: number;
  loading: boolean;
  pending: boolean;
  error: string | null;
  refresh(): Promise<void>;
  act(command: SocialCommand): Promise<boolean>;
}
const Context = React.createContext<Value | null>(null);
export const useOptionalSocial = () => React.useContext(Context);
export const useSocial = () => {
  const c = React.useContext(Context);
  if (!c) throw new Error("SocialProvider missing");
  return c;
};
/** Exactly one subscription across both Chat and the normal page layout. */
export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { selectedTripId, selectTrip, trips } = useTrip();
  const location = useLocation();
  const identity = `${user?.id ?? ""}:${selectedTripId ?? ""}`;
  const current = React.useRef(identity);
  current.current = identity;
  const handledLink = React.useRef<string | null>(null);
  const request = React.useRef(0);
  const busy = React.useRef(new Set<string>());
  const keys = React.useRef(new Map<string, string>());
  const [snapshot, setSnapshot] = React.useState<{
    identity: string;
    data: SocialState;
    received: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    if (!user || !selectedTripId) return;
    const version = ++request.current;
    setLoading(true);
    try {
      const data = await socialApi.state(selectedTripId);
      if (
        current.current === identity &&
        version === request.current &&
        data.trip_id === selectedTripId
      ) {
        setSnapshot({ identity, data, received: Date.now() });
        setError(null);
      }
    } catch (e) {
      if (current.current === identity && version === request.current) {
        setError(socialError(e));
        setSnapshot(null);
      }
    } finally {
      if (current.current === identity && version === request.current)
        setLoading(false);
    }
  }, [user?.id, selectedTripId, identity]);
  React.useEffect(() => {
    setSnapshot(null);
    setError(null);
    setPending(false);
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);
  React.useEffect(() => {
    if (!user || !selectedTripId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase.channel(`social:${identity}`);
    for (const table of [
      "social_events",
      "in_app_notifications",
      "shot_draws",
      "headshot_rights",
    ])
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `trip_id=eq.${selectedTripId}`,
        },
        schedule,
      );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") schedule();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    // Reconnect fallback; this reads state only and never drives a draw outcome.
    const poll = setInterval(visible, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
      void supabase.removeChannel(channel);
    };
  }, [identity, refresh, selectedTripId, user?.id]);
  // A push can select only a trip already returned by the authorized TripContext.
  React.useEffect(() => {
    const requested = new URLSearchParams(location.search).get("trip");
    const linkKey = location.key + location.search;
    if (!requested || handledLink.current === linkKey || trips.length === 0)
      return;
    handledLink.current = linkKey;
    if (!trips.some((t) => t.id === requested)) {
      setError("Du har ikke tilgang til turen i varselet.");
      return;
    }
    if (requested !== selectedTripId)
      void selectTrip(requested).catch(() =>
        setError("Du har ikke tilgang til turen i varselet."),
      );
  }, [location.key, location.search, selectedTripId, selectTrip, trips]);
  const act = React.useCallback(
    async (command: SocialCommand) => {
      if (!user || !selectedTripId) return false;
      const signature = `social-command:${identity}:${JSON.stringify(command)}`;
      if (busy.current.has(signature)) return false;
      let key = keys.current.get(signature);
      if (!key) {
        try {
          key = sessionStorage.getItem(signature) ?? undefined;
        } catch {
          /* private mode */
        }
      }
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(signature, key);
        try {
          sessionStorage.setItem(signature, key);
        } catch {
          /* in-memory retry retained */
        }
      }
      busy.current.add(signature);
      setPending(true);
      setError(null);
      try {
        const result = await socialApi.command(selectedTripId, key, command);
        if (!result.committed) throw new Error("not_committed");
        keys.current.delete(signature);
        try {
          sessionStorage.removeItem(signature);
        } catch {
          /* no-op */
        }
        if (current.current === identity) await refresh();
        return true;
      } catch (e) {
        if (current.current === identity) setError(socialError(e));
        return false;
      } finally {
        busy.current.delete(signature);
        if (current.current === identity) setPending(false);
      }
    },
    [identity, selectedTripId, user?.id, refresh],
  );
  const state = snapshot?.identity === identity ? snapshot.data : null;
  return (
    <Context.Provider
      value={{
        state,
        receivedAt: snapshot?.received ?? 0,
        loading,
        pending,
        error,
        refresh,
        act,
      }}
    >
      {children}
    </Context.Provider>
  );
}
