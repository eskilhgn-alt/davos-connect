/**
 * usePolls – Hook for polls CRUD, voting, and realtime updates
 * Sends system messages to chat when polls are created/resolved
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000000";

/** Posts a system message in the group chat */
async function postSystemChatMessage(text: string) {
  await supabase.from("messages").insert({
    thread_id: DEFAULT_THREAD_ID,
    sender_id: SYSTEM_SENDER_ID,
    sender_name: "📊 Avstemming",
    text,
  });
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  vote_count: number;
  voters: string[]; // user_ids
}

export interface Poll {
  id: string;
  created_by: string;
  creator_name: string;
  question: string;
  require_all: boolean;
  send_push_on_create: boolean;
  send_push_on_resolved: boolean;
  deadline_at: string | null;
  resolved_at: string | null;
  winning_option_id: string | null;
  status: string;
  created_at: string;
  options: PollOption[];
  my_vote: string | null; // option_id I voted for
  total_votes: number;
  total_users: number;
}

export function usePolls() {
  const { user } = useAuth();
  const [polls, setPolls] = React.useState<Poll[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchPolls = React.useCallback(async () => {
    const [pollsRes, optionsRes, votesRes, profilesRes] = await Promise.all([
      supabase.from("polls").select("*").order("created_at", { ascending: false }),
      supabase.from("poll_options").select("*").order("sort_order"),
      supabase.from("poll_votes").select("*"),
      supabase.from("profiles").select("id, nickname, full_name, is_active").eq("is_active", true),
    ]);

    if (pollsRes.error || optionsRes.error || votesRes.error || profilesRes.error) {
      console.error("Poll fetch error:", pollsRes.error || optionsRes.error || votesRes.error);
      setLoading(false);
      return;
    }

    const profileMap = new Map(
      (profilesRes.data || []).map((p) => [p.id, p.nickname || p.full_name || "Ukjent"])
    );
    const totalUsers = profilesRes.data?.length || 0;

    const enriched: Poll[] = (pollsRes.data || []).map((p) => {
      const opts = (optionsRes.data || []).filter((o) => o.poll_id === p.id);
      const votes = (votesRes.data || []).filter((v) => v.poll_id === p.id);
      const myVote = user ? votes.find((v) => v.user_id === user.id)?.option_id || null : null;

      const options: PollOption[] = opts.map((o) => {
        const optVotes = votes.filter((v) => v.option_id === o.id);
        return {
          id: o.id,
          poll_id: o.poll_id,
          label: o.label,
          sort_order: o.sort_order,
          vote_count: optVotes.length,
          voters: optVotes.map((v) => v.user_id),
        };
      });

      return {
        id: p.id,
        created_by: p.created_by,
        creator_name: profileMap.get(p.created_by) || "Ukjent",
        question: p.question,
        require_all: p.require_all,
        send_push_on_create: p.send_push_on_create,
        send_push_on_resolved: p.send_push_on_resolved,
        deadline_at: p.deadline_at,
        resolved_at: p.resolved_at,
        winning_option_id: p.winning_option_id,
        status: p.status,
        created_at: p.created_at,
        options,
        my_vote: myVote,
        total_votes: votes.length,
        total_users: totalUsers,
      };
    });

    setPolls(enriched);
    setLoading(false);
  }, [user]);

  // Initial fetch + realtime
  React.useEffect(() => {
    fetchPolls();

    const channel = supabase
      .channel("polls-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => fetchPolls())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, () => fetchPolls())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPolls]);

  const createPoll = async (
    question: string,
    options: string[],
    settings: { requireAll: boolean; sendPushOnCreate: boolean; sendPushOnResolved: boolean; deadlineMinutes: number | null }
  ) => {
    if (!user) return;

    const deadlineAt = settings.deadlineMinutes
      ? new Date(Date.now() + settings.deadlineMinutes * 60_000).toISOString()
      : null;

    const { data: poll, error } = await supabase
      .from("polls")
      .insert({
        created_by: user.id,
        question: question.trim(),
        require_all: settings.requireAll,
        send_push_on_create: settings.sendPushOnCreate,
        send_push_on_resolved: settings.sendPushOnResolved,
        deadline_at: deadlineAt,
      })
      .select()
      .single();

    if (error || !poll) {
      toast.error("Kunne ikke opprette avstemming");
      return null;
    }

    const optionRows = options.map((label, i) => ({
      poll_id: poll.id,
      label: label.trim(),
      sort_order: i,
    }));

    const { error: optError } = await supabase.from("poll_options").insert(optionRows);
    if (optError) {
      toast.error("Kunne ikke legge til alternativer");
      return null;
    }

    // Send push notification
    if (settings.sendPushOnCreate) {
      supabase.functions.invoke("poll-push", {
        body: { poll_id: poll.id, type: "created" },
      }).catch(console.warn);
    }

    toast.success("Avstemming opprettet!");

    // Post system message in chat
    const { data: prof } = await supabase.from("profiles").select("nickname, full_name").eq("id", user.id).single();
    const creatorName = prof?.nickname || prof?.full_name || "Noen";
    postSystemChatMessage(
      `${creatorName} har startet en avstemming: "${question.trim()}"\n👉 Gå til Avstemminger for å stemme`
    ).catch(console.warn);

    await fetchPolls();
    return poll.id;
  };

  const vote = async (pollId: string, optionId: string) => {
    if (!user) return;

    // Check if user already voted on this poll
    const { data: existing } = await supabase
      .from("poll_votes")
      .select("id")
      .eq("poll_id", pollId)
      .eq("user_id", user.id)
      .maybeSingle();

    let error;
    if (existing) {
      // Update existing vote
      ({ error } = await supabase
        .from("poll_votes")
        .update({ option_id: optionId })
        .eq("id", existing.id));
    } else {
      // Insert new vote
      ({ error } = await supabase
        .from("poll_votes")
        .insert({ poll_id: pollId, option_id: optionId, user_id: user.id }));
    }

    if (error) {
      console.error("Vote error:", error);
      toast.error("Kunne ikke stemme");
      return;
    }

    // Optimistic refetch
    await fetchPolls();

    // Check if all voted (require_all)
    await checkResolution(pollId);
  };

  const checkResolution = async (pollId: string) => {
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.status !== "active") return;

    // Refetch votes
    const { data: votes } = await supabase
      .from("poll_votes")
      .select("*")
      .eq("poll_id", pollId);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true);

    const totalUsers = profiles?.length || 0;
    const totalVotes = votes?.length || 0;

    if (poll.require_all && totalVotes >= totalUsers) {
      await resolvePoll(pollId);
    }
  };

  const resolvePoll = async (pollId: string) => {
    // Find winning option
    const { data: votes } = await supabase
      .from("poll_votes")
      .select("option_id")
      .eq("poll_id", pollId);

    if (!votes || votes.length === 0) return;

    const counts = new Map<string, number>();
    votes.forEach((v) => counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1));

    let winnerId = "";
    let maxCount = 0;
    counts.forEach((count, id) => {
      if (count > maxCount) { maxCount = count; winnerId = id; }
    });

    await supabase
      .from("polls")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), winning_option_id: winnerId })
      .eq("id", pollId);

    // Find winning option label
    const poll = polls.find((p) => p.id === pollId);
    const winningOption = poll?.options.find(o => o.id === winnerId);

    // Post result in chat
    if (poll && winningOption) {
      postSystemChatMessage(
        `Avstemming avgjort: "${poll.question}"\n🏆 Resultat: ${winningOption.label}`
      ).catch(console.warn);
    }

    // Send resolved push
    if (poll?.send_push_on_resolved) {
      supabase.functions.invoke("poll-push", {
        body: { poll_id: pollId, type: "resolved" },
      }).catch(console.warn);
    }
  };

  const closePoll = async (pollId: string) => {
    await resolvePoll(pollId);
    await fetchPolls();
  };

  return { polls, loading, createPoll, vote, closePoll, refetch: fetchPolls };
}
