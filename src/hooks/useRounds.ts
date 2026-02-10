/**
 * Hook for managing drink rounds
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DrinkQuantities = Record<string, number>;

export interface Round {
  id: string;
  buyer_id: string;
  drink_type: string;
  drink_quantities: DrinkQuantities;
  total_cost: number;
  cost_per_person: number;
  note: string | null;
  receipt_image_url: string | null;
  created_at: string;
  participants: { user_id: string }[];
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

export function useRounds() {
  const { user } = useAuth();
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }>>({});
  const [loading, setLoading] = React.useState(true);

  const fetchProfiles = React.useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, nickname, avatar_url");
    if (data) {
      const map: Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }> = {};
      data.forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }
  }, []);

  const fetchRounds = React.useCallback(async () => {
    setLoading(true);
    const { data: roundsData } = await supabase
      .from("rounds")
      .select("*")
      .order("created_at", { ascending: false });

    if (roundsData) {
      const roundIds = roundsData.map((r: any) => r.id);
      const { data: parts } = roundIds.length > 0
        ? await supabase.from("round_participants").select("round_id, user_id").in("round_id", roundIds)
        : { data: [] };

      const partMap: Record<string, { user_id: string }[]> = {};
      (parts || []).forEach((p: any) => {
        if (!partMap[p.round_id]) partMap[p.round_id] = [];
        partMap[p.round_id].push({ user_id: p.user_id });
      });

      setRounds(
        roundsData.map((r: any) => ({
          ...r,
          total_cost: Number(r.total_cost),
          cost_per_person: Number(r.cost_per_person),
          drink_quantities: (r.drink_quantities as DrinkQuantities) || {},
          participants: partMap[r.id] || [],
        }))
      );
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchProfiles().then(fetchRounds);
  }, [fetchProfiles, fetchRounds]);

  React.useEffect(() => {
    const channel = supabase
      .channel("rounds-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rounds" }, () => {
        fetchRounds();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRounds]);

  const addRound = async (
    buyerId: string,
    drinkType: string,
    totalCost: number,
    costPerPerson: number,
    participantIds: string[],
    note?: string,
    drinkQuantities?: DrinkQuantities,
    receiptImageUrl?: string
  ) => {
    const { data: round, error } = await supabase
      .from("rounds")
      .insert({
        buyer_id: buyerId,
        drink_type: drinkType,
        total_cost: totalCost,
        cost_per_person: costPerPerson,
        note: note || null,
        drink_quantities: drinkQuantities || {},
        receipt_image_url: receiptImageUrl || null,
      })
      .select()
      .single();

    if (error || !round) return { error };

    const rows = participantIds.map((uid) => ({ round_id: round.id, user_id: uid }));
    await supabase.from("round_participants").insert(rows);

    try {
      await supabase.functions.invoke("round-push", {
        body: { round_id: round.id, buyer_id: buyerId, drink_type: drinkType, participant_ids: participantIds, drink_quantities: drinkQuantities || {} },
      });
    } catch (e) {
      console.warn("Push failed:", e);
    }

    await fetchRounds();
    return { error: null };
  };

  const summaries = React.useMemo((): RoundSummary[] => {
    const userMap: Record<string, { rounds_bought: number; total_spent: number; rounds_received: number }> = {};
    const ensureUser = (uid: string) => {
      if (!userMap[uid]) userMap[uid] = { rounds_bought: 0, total_spent: 0, rounds_received: 0 };
    };
    rounds.forEach((r) => {
      ensureUser(r.buyer_id);
      userMap[r.buyer_id].rounds_bought += 1;
      userMap[r.buyer_id].total_spent += r.total_cost;
      r.participants.forEach((p) => {
        ensureUser(p.user_id);
        userMap[p.user_id].rounds_received += 1;
      });
    });
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

  return { rounds, summaries, profiles, loading, addRound, refetch: fetchRounds };
}
