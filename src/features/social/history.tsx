import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "react-router-dom";
import { socialApi, socialError } from "./api";
import { useSocial } from "./SocialProvider";
import type { HistoryCursor, SocialEvent, SocialDraw } from "./types";
type Item = { id: string; created_at?: string; event?: { created_at: string } };
/** Paged historical data is isolated per authorized trip and never replaces live rows. */
export function useSocialHistory<T extends Item>(kind: string, base: T[]) {
  const { state } = useSocial();
  const identity = state?.trip_id;
  const current = React.useRef(identity);
  current.current = identity;
  const [page, setPage] = React.useState<{
    trip: string;
    items: T[];
    cursor: HistoryCursor | null;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sequence = React.useRef(0);
  const flight = React.useRef<{ identity: string; version: number } | null>(
    null,
  );
  const load = React.useCallback(
    async (cursor: HistoryCursor | null) => {
      if (!identity || flight.current?.identity === identity) return;
      const version = ++sequence.current;
      flight.current = { identity, version };
      setBusy(true);
      setError(null);
      try {
        const result = await socialApi.history<T>(identity, kind, cursor);
        if (current.current === identity && sequence.current === version)
          setPage((old) => ({
            trip: identity,
            items: [
              ...(cursor && old?.trip === identity ? old.items : []),
              ...result.items,
            ],
            cursor: result.cursor,
          }));
      } catch (e) {
        if (current.current === identity && sequence.current === version)
          setError(socialError(e));
      } finally {
        if (flight.current?.version === version) flight.current = null;
        if (current.current === identity && sequence.current === version)
          setBusy(false);
      }
    },
    [identity, kind],
  );
  React.useEffect(() => {
    flight.current = null;
    sequence.current++;
    setPage(null);
    setError(null);
    setBusy(false);
    void load(null);
  }, [load]);
  const rows = new Map<string, T>();
  if (page && page.trip === identity)
    for (const row of page.items) rows.set(row.id, row);
  for (const row of base) rows.set(row.id, row);
  const items = [...rows.values()].sort(
    (a, b) =>
      (b.created_at ?? b.event?.created_at ?? "").localeCompare(
        a.created_at ?? a.event?.created_at ?? "",
      ) || b.id.localeCompare(a.id),
  );
  return {
    items,
    busy,
    error,
    hasMore: page && page.trip === identity ? !!page.cursor : true,
    loadMore: () => load(page && page.trip === identity ? page.cursor : null),
  };
}
export function OlderHistory({
  history,
}: {
  history: {
    busy: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore(): Promise<void>;
  };
}) {
  return (
    <>
      {history.error && <p role="alert">{history.error}</p>}
      {history.hasMore && (
        <button
          className="min-h-12 underline"
          disabled={history.busy}
          onClick={() => void history.loadMore()}
        >
          {history.busy ? "Laster …" : "Vis eldre"}
        </button>
      )}
    </>
  );
}
/** A push can reference an event older than the first history page. */
export function EventFocus() {
  const { state, act, pending } = useSocial();
  const { user } = useAuth();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const eventId = params.get("event");
  const requestedTrip = params.get("trip");
  const [result, setResult] = React.useState<{
    identity: string;
    event: SocialEvent;
    draw: SocialDraw | null;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const identity = `${state?.trip_id}:${eventId}`;
  React.useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);
    if (state && eventId && requestedTrip === state.trip_id)
      void socialApi
        .event(state.trip_id, eventId)
        .then((r) => {
          if (live) setResult({ identity, ...r });
        })
        .catch((e) => {
          if (live) setError(socialError(e));
        });
    return () => {
      live = false;
    };
  }, [identity, state?.server_now, requestedTrip]);
  if (!eventId || !state || state.trip_id !== requestedTrip) return null;
  if (error) return <p role="alert">{error}</p>;
  if (result?.identity !== identity)
    return <p role="status">Åpner hendelsen …</p>;
  const d = result.draw;
  return (
    <section
      aria-label="Hendelsen fra varselet"
      className="rounded-xl border-2 border-primary p-4 space-y-2"
    >
      <h2 className="font-bold">{result.event.title}</h2>
      <p>{result.event.body}</p>
      <time className="text-xs">
        {new Date(result.event.created_at).toLocaleString("nb-NO")}
      </time>
      {d && (
        <p>
          {d.response === "taken"
            ? "Tok shot"
            : d.response === "declined"
              ? "Feiget ut"
              : d.status === "countdown"
                ? "Trekningen pågår."
                : "Svaret vises i loggen."}
        </p>
      )}
      {d?.status === "finalized" &&
        !d.response &&
        d.winner_id === user?.id &&
        state.writable && (
          <div className="flex gap-3">
            {(["taken", "declined"] as const).map((answer) => (
              <button
                key={answer}
                disabled={pending}
                className="min-h-12 flex-1 rounded-lg border p-2"
                onClick={() =>
                  void act({ action: "respond", source_id: d.id, text: answer })
                }
              >
                {answer === "taken" ? "Tok shot" : "Feiget ut"}
              </button>
            ))}
          </div>
        )}
    </section>
  );
}
