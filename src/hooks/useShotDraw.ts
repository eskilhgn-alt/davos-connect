/**
 * useShotDraw — turavgrenset klient for Shot-trekning.
 *
 * Sannhetskilde er alltid serveren:
 *  - `server_now` fra RPC/Edge brukes til å beregne resttid (klokkeskew).
 *  - finalisering skjer kun via idempotent server-RPC, aldri lokal random.
 *  - alle fetch og realtime-kanaler er filtrert på valgt trip_id, og svar fra
 *    en tidligere tur forkastes med en generation guard.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/contexts/TripContext";
import { errorToast } from "@/utils/errorToast";
import { shotApi } from "@/features/shot/api";
import type { ShotDraw, ShotParticipant, ShotState, ShotStatRow } from "@/features/shot/types";
import { isDue, remainingMs } from "@/features/shot/types";
import { isForSelectedTrip } from "@/features/trip/tripSync";

interface Snapshot {
  state: ShotState;
  /** performance-uavhengig lokalt tidspunkt da svaret kom inn. */
  receivedAt: number;
}

// deno-lint-ignore no-explicit-any
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;

const rpc: Rpc = (name, args) =>
  (supabase.rpc as unknown as Rpc)(name, args);

export function useShotDraw() {
  const { selectedTripId, isArchive } = useTrip();
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [history, setHistory] = React.useState<ShotDraw[]>([]);
  const [stats, setStats] = React.useState<ShotStatRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isStarting, setIsStarting] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  const generation = React.useRef(0);
  const finalizing = React.useRef<string | null>(null);

  const load = React.useCallback(
    async (tripId: string, gen: number) => {
      const [current, hist, st] = await Promise.all([
        rpc("rpc_shot_current", { p_trip_id: tripId }),
        supabase
          .from("shot_draws" as never)
          .select("*")
          .eq("trip_id", tripId)
          .eq("status", "finalized")
          .order("finalized_at", { ascending: false })
          .limit(50),
        rpc("rpc_shot_stats", { p_trip_id: tripId }),
      ]);
      if (gen !== generation.current) return; // tur byttet – forkast svaret
      if (current.error) throw current.error;
      const state = current.data as ShotState;
      // Eksplisitt turkontekst: et sent svar for en annen tur forkastes.
      if (!isForSelectedTrip(tripId, state?.draw?.trip_id ?? null)) return;
      setSnapshot({ state, receivedAt: Date.now() });
      setHistory((hist.data ?? []) as unknown as ShotDraw[]);
      setStats((st.data ?? []) as ShotStatRow[]);
      // Forfalt trekning ved åpning/reconnect: serveren reparerer idempotent
      // (og sender resultat-push) – klienten avgjør aldri utfallet selv.
      if (state?.draw?.status === "countdown" && Date.parse(state.draw.draw_at) <= Date.parse(state.server_now)) {
        const repaired = await shotApi.repair(tripId).catch(() => null);
        if (repaired && gen === generation.current) {
          setSnapshot({ state: repaired, receivedAt: Date.now() });
        }
      }
    },
    [],
  );

  const refresh = React.useCallback(async () => {
    if (!selectedTripId) {
      setSnapshot(null);
      setHistory([]);
      setStats([]);
      setIsLoading(false);
      return;
    }
    const gen = ++generation.current;
    setIsLoading(true);
    try {
      await load(selectedTripId, gen);
    } catch (err) {
      if (gen === generation.current) console.warn("[shot] load failed", err);
    } finally {
      if (gen === generation.current) setIsLoading(false);
    }
  }, [selectedTripId, load]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime, strengt filtrert på valgt tur.
  React.useEffect(() => {
    if (!selectedTripId) return;
    const channel = supabase
      .channel(`shot-draws:${selectedTripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shot_draws",
          filter: `trip_id=eq.${selectedTripId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { trip_id?: string } | null;
          if (!isForSelectedTrip(selectedTripId, row?.trip_id ?? null)) return;
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedTripId, refresh]);

  // Visningstimer. Driver kun UI – aldri finalisering.
  React.useEffect(() => {
    if (snapshot?.state.draw?.status !== "countdown") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [snapshot?.state.draw?.status, snapshot?.state.draw?.id]);

  const draw = snapshot?.state.draw ?? null;
  const participants: ShotParticipant[] = snapshot?.state.participants ?? [];

  const remaining = React.useMemo(() => {
    if (!draw || !snapshot) return 0;
    void tick;
    return remainingMs(draw.draw_at, snapshot.state.server_now, snapshot.receivedAt, Date.now());
  }, [draw, snapshot, tick]);

  const due = React.useMemo(() => {
    if (!draw || !snapshot) return false;
    void tick;
    return isDue(draw, snapshot.state.server_now, snapshot.receivedAt, Date.now());
  }, [draw, snapshot, tick]);

  /** Idempotent reparasjon: serveren avgjør, aldri klienten. */
  const finalizeIfDue = React.useCallback(async () => {
    if (!draw || !due) return;
    if (finalizing.current === draw.id) return;
    finalizing.current = draw.id;
    const gen = generation.current;
    try {
      const state = await shotApi.finalize(draw.id);
      if (gen !== generation.current) return;
      setSnapshot({ state, receivedAt: Date.now() });
      if (selectedTripId) await load(selectedTripId, gen);
    } catch (err) {
      console.warn("[shot] finalize failed", err);
    } finally {
      finalizing.current = null;
    }
  }, [draw, due, selectedTripId, load]);

  React.useEffect(() => {
    if (due) void finalizeIfDue();
  }, [due, finalizeIfDue]);

  // Reparer også ved reconnect / når fanen kommer i forgrunnen.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const start = React.useCallback(async () => {
    if (!selectedTripId || isArchive || isStarting) return;
    setIsStarting(true);
    const gen = generation.current;
    try {
      const state = await shotApi.start(selectedTripId);
      if (gen !== generation.current) return;
      setSnapshot({ state, receivedAt: Date.now() });
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "Kunne ikke starte trekning");
    } finally {
      setIsStarting(false);
    }
  }, [selectedTripId, isArchive, isStarting]);

  return {
    tripId: selectedTripId,
    isArchive,
    isLoading,
    isStarting,
    draw,
    participants,
    remainingMs: remaining,
    history,
    stats,
    start,
    refresh,
  };
}
