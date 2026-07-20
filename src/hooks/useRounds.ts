/**
 * Server-authoritative round management.
 * A round and all participants are created in one idempotent SQL transaction.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

export type DrinkQuantities = Record<string, number>;

export interface Round {
  id: string;
  buyer_id: string;
  drink_type: string;
  drink_quantities: DrinkQuantities;
  total_cost: number;
  cost_per_person: number;
  currency: string;
  note: string | null;
  receipt_image_url: string | null;
  receipt_uploaded_by: string | null;
  is_treated: boolean;
  created_at: string;
  participants: { user_id: string }[];
}

export interface CreateRoundInput {
  clientId: string;
  drinkType: string;
  totalCost: number;
  participantIds: string[];
  note?: string;
  drinkQuantities: DrinkQuantities;
  receiptPath?: string;
  isTreated: boolean;
  currency: string;
}

export interface CreateRoundResult {
  error: { message?: string; code?: string } | null;
  roundId?: string;
  /** Safe to remove an attempt-owned receipt only when the server confirmed no row exists. */
  canCleanupReceipt: boolean;
}

export interface RoundSummary {
  user_id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  rounds_bought: number;
  total_spent: number;
  rounds_received: number;
}

type RoundRow = Database["public"]["Tables"]["rounds"]["Row"];

export function useRounds() {
  const { user } = useAuth();
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfiles = React.useCallback(async () => {
    const { data, error: profileError } = await supabase
      .from("profiles").select("id, full_name, nickname, avatar_url");
    if (profileError) throw profileError;
    const map: Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }> = {};
    for (const p of data || []) map[p.id] = p;
    setProfiles(map);
  }, []);

  const fetchRounds = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: roundsData, error: roundsError } = await supabase
        .from("rounds")
        .select("*")
        .order("created_at", { ascending: false });
      if (roundsError) throw roundsError;

      const roundIds = (roundsData || []).map((r) => r.id);
      const partsResult = roundIds.length > 0
        ? await supabase.from("round_participants").select("round_id, user_id").in("round_id", roundIds)
        : { data: [] as { round_id: string; user_id: string }[], error: null };
      if (partsResult.error) throw partsResult.error;

      const partMap: Record<string, { user_id: string }[]> = {};
      for (const p of partsResult.data || []) {
        (partMap[p.round_id] ||= []).push({ user_id: p.user_id });
      }

      setRounds((roundsData || []).map((r: RoundRow) => ({
        ...r,
        total_cost: Number(r.total_cost),
        cost_per_person: Number(r.cost_per_person),
        drink_quantities: (r.drink_quantities as DrinkQuantities) || {},
        participants: partMap[r.id] || [],
      })));
    } catch (e) {
      console.error("[rounds] load failed", e);
      setError(e instanceof Error ? e.message : "Kunne ikke laste runder");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void Promise.all([fetchProfiles(), fetchRounds()]).catch((e) => {
      console.error("[rounds] initial load failed", e);
      setError(e instanceof Error ? e.message : "Kunne ikke laste runder");
      setLoading(false);
    });
  }, [fetchProfiles, fetchRounds]);

  React.useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => void fetchRounds(), 80);
    };
    const channel = supabase
      .channel("rounds-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_participants" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchRounds]);

  const addRound = React.useCallback(async (input: CreateRoundInput): Promise<CreateRoundResult> => {
    if (!user) return { error: { message: "Ikke innlogget" }, canCleanupReceipt: false };
    const { data, error: rpcError } = await supabase.rpc("create_round_with_participants", {
      p_client_id: input.clientId,
      p_currency: input.currency,
      p_drink_quantities: input.drinkQuantities as Json,
      p_drink_type: input.drinkType,
      p_is_treated: input.isTreated,
      p_note: input.note?.trim() || null,
      p_participant_ids: input.participantIds,
      p_receipt_path: input.receiptPath || null,
      p_total_cost: input.totalCost,
    });

    let round = data;
    if (rpcError) {
      // Lost responses are recovered by the same client id. Only authorize
      // receipt cleanup if a follow-up query succeeds and proves no row exists.
      const existing = await supabase.from("rounds")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("client_id", input.clientId)
        .maybeSingle();
      if (existing.data) {
        round = { id: existing.data.id } as RoundRow;
      } else {
        return {
          error: rpcError,
          canCleanupReceipt: !existing.error,
        };
      }
    }

    try {
      // Legacy fields keep the currently deployed function working until the
      // hardened round-id-only version in this commit is deployed. The new
      // function ignores these extras and reads canonical data from the DB.
      await supabase.functions.invoke("round-push", {
        body: {
          round_id: round.id,
          buyer_id: user.id,
          drink_type: input.drinkType,
          participant_ids: input.participantIds,
          drink_quantities: input.drinkQuantities,
          is_treated: input.isTreated,
        },
      });
    } catch (pushError) {
      console.warn("[rounds] push failed", pushError);
    }
    await fetchRounds();
    return { error: null, roundId: round.id, canCleanupReceipt: false };
  }, [user, fetchRounds]);

  const updateRound = React.useCallback(async (
    roundId: string,
    updates: {
      drink_quantities?: DrinkQuantities;
      total_cost?: number;
      cost_per_person?: number;
      note?: string | null;
      is_treated?: boolean;
    },
  ) => {
    const { error: updateError } = await supabase.from("rounds").update({
      ...updates,
      drink_quantities: updates.drink_quantities as Json | undefined,
    }).eq("id", roundId);
    if (!updateError) await fetchRounds();
    return { error: updateError };
  }, [fetchRounds]);

  const summaries = React.useMemo((): RoundSummary[] => {
    const userMap: Record<string, { rounds_bought: number; total_spent: number; rounds_received: number }> = {};
    const ensureUser = (uid: string) => {
      if (!userMap[uid]) userMap[uid] = { rounds_bought: 0, total_spent: 0, rounds_received: 0 };
    };
    for (const r of rounds) {
      ensureUser(r.buyer_id);
      userMap[r.buyer_id].rounds_bought += 1;
      userMap[r.buyer_id].total_spent += r.total_cost;
      for (const p of r.participants) {
        ensureUser(p.user_id);
        userMap[p.user_id].rounds_received += 1;
      }
    }
    return Object.entries(userMap)
      .map(([uid, stats]) => ({
        user_id: uid,
        full_name: profiles[uid]?.full_name ?? null,
        nickname: profiles[uid]?.nickname ?? null,
        avatar_url: profiles[uid]?.avatar_url ?? null,
        ...stats,
      }))
      .sort((a, b) => b.rounds_bought - a.rounds_bought);
  }, [rounds, profiles]);

  return { rounds, summaries, profiles, loading, error, addRound, updateRound, refetch: fetchRounds };
}
