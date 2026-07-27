/**
 * usePolls – Full poll state machine with tie handling, cancel, force close,
 * quorum, rate limiting, reminders, and chat integration
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { useTrip } from "@/contexts/TripContext";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

/** Posts a poll event as the authenticated actor so chat INSERT RLS is upheld. */
async function postPollChatMessage(
  senderId: string,
  text: string,
  pollId: string,
  type: "created" | "ended" | "cancelled" | "reminder",
  tripId: string | null,
) {
  await supabase.from("messages").insert({
    thread_id: DEFAULT_THREAD_ID,
    trip_id: tripId,
    sender_id: senderId,
    sender_name: "📊 Avstemming",
    text,
    // Store poll reference in attachments as a real JSON array (jsonb column).
    // Passing a string would double-encode and break clients that expect an array.
    attachments: [{ kind: "poll", poll_id: pollId, poll_event: type }] as never,
  } as never);
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  vote_count: number;
  voters: { user_id: string; display_name: string }[];
}

export interface Poll {
  id: string;
  created_by: string;
  creator_name: string;
  question: string;
  require_all: boolean;
  min_votes: number | null;
  is_pinned: boolean;
  send_push_on_create: boolean;
  send_push_on_resolved: boolean;
  deadline_at: string | null;
  resolved_at: string | null;
  winning_option_id: string | null;
  status: "active" | "resolved" | "cancelled";
  created_at: string;
  options: PollOption[];
  my_vote: string | null;
  total_votes: number;
  total_users: number;
  missing_voters: { user_id: string; display_name: string }[];
  is_tie: boolean;
  tied_option_ids: string[];
}

// Rate limit: max 2 polls per 10 minutes per user
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 2;

export function usePolls() {
  const { user } = useAuth();
  // Turgrense: avstemminger tilhører valgt tur. Arkiverte turer er lesbare,
  // men all skriving blokkeres her i tillegg til i databasen.
  const { selectedTripId, isArchive } = useTrip();
  const tripRef = React.useRef<string | null>(selectedTripId);
  tripRef.current = selectedTripId;
  const blockedByArchive = React.useCallback(() => {
    if (isArchive) {
      errorToast("Arkivert tur – kan ikke endre avstemminger");
      return true;
    }
    return false;
  }, [isArchive]);
  const [polls, setPolls] = React.useState<Poll[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchPolls = React.useCallback(async () => {
    const tripAtStart = selectedTripId;
    if (!tripAtStart) { setPolls([]); setLoading(false); return; }
    const [pollsRes, optionsRes, votesRes, profilesRes] = await Promise.all([
      supabase.from("polls").select("*").eq("trip_id" as never, tripAtStart as never).order("created_at", { ascending: false }),
      supabase.from("poll_options").select("*").order("sort_order"),
      supabase.from("poll_votes").select("*").eq("trip_id" as never, tripAtStart as never),
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
    const allActiveUserIds = (profilesRes.data || []).map((p) => p.id);
    const totalUsers = allActiveUserIds.length;

    const enriched: Poll[] = (pollsRes.data || []).map((p) => {
      const opts = (optionsRes.data || []).filter((o) => o.poll_id === p.id);
      const votes = (votesRes.data || []).filter((v) => v.poll_id === p.id);
      const myVote = user ? votes.find((v) => v.user_id === user.id)?.option_id || null : null;

      const voterIds = new Set(votes.map((v) => v.user_id));
      const missing = allActiveUserIds
        .filter((uid) => !voterIds.has(uid))
        .map((uid) => ({ user_id: uid, display_name: profileMap.get(uid) || "Ukjent" }));

      const options: PollOption[] = opts.map((o) => {
        const optVotes = votes.filter((v) => v.option_id === o.id);
        return {
          id: o.id,
          poll_id: o.poll_id,
          label: o.label,
          sort_order: o.sort_order,
          vote_count: optVotes.length,
          voters: optVotes.map((v) => ({
            user_id: v.user_id,
            display_name: profileMap.get(v.user_id) || "Ukjent",
          })),
        };
      });

      // Check for tie
      const maxVotes = Math.max(...options.map((o) => o.vote_count), 0);
      const tiedOptions = maxVotes > 0 ? options.filter((o) => o.vote_count === maxVotes) : [];
      const isTie = tiedOptions.length > 1;

      return {
        id: p.id,
        created_by: p.created_by,
        creator_name: profileMap.get(p.created_by) || "Ukjent",
        question: p.question,
        require_all: p.require_all,
        min_votes: p.min_votes ?? null,
        is_pinned: p.is_pinned ?? false,
        send_push_on_create: p.send_push_on_create,
        send_push_on_resolved: p.send_push_on_resolved,
        deadline_at: p.deadline_at,
        resolved_at: p.resolved_at,
        winning_option_id: p.winning_option_id,
        status: p.status as Poll["status"],
        created_at: p.created_at,
        options,
        my_vote: myVote,
        total_votes: votes.length,
        total_users: totalUsers,
        missing_voters: missing,
        is_tie: isTie,
        tied_option_ids: tiedOptions.map((o) => o.id),
      };
    });

    if (tripRef.current !== tripAtStart) return; // tur byttet under lasting
    setPolls(enriched);
    setLoading(false);
  }, [user, selectedTripId]);

  // Initial fetch + realtime
  React.useEffect(() => {
    fetchPolls();

    if (!selectedTripId) return;
    const channel = supabase
      .channel(`polls-realtime-${selectedTripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `trip_id=eq.${selectedTripId}` }, () => fetchPolls())
      .on("postgres_changes", { event: "*", schema: "public", table: "polls", filter: `trip_id=eq.${selectedTripId}` }, () => fetchPolls())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPolls, selectedTripId]);

  // Auto-resolve: check deadlines every 30s
  React.useEffect(() => {
    const interval = setInterval(() => {
      polls.forEach((poll) => {
        if (poll.status === "active" && poll.deadline_at && new Date(poll.deadline_at) < new Date()) {
          resolvePoll(poll.id);
        }
      });
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls]);

  const createPoll = async (
    question: string,
    options: string[],
    settings: {
      requireAll: boolean;
      sendPushOnCreate: boolean;
      sendPushOnResolved: boolean;
      deadlineMinutes: number | null;
      minVotes: number | null;
    }
  ) => {
    if (!user || !selectedTripId) return null;
    if (blockedByArchive()) return null;

    // Rate limit check
    const recentPolls = polls.filter(
      (p) => p.created_by === user.id && new Date(p.created_at).getTime() > Date.now() - RATE_LIMIT_WINDOW_MS
    );
    if (recentPolls.length >= RATE_LIMIT_MAX) {
      errorToast("Du kan maks opprette 2 avstemminger per 10 minutter");
      return null;
    }

    const deadlineAt = settings.deadlineMinutes
      ? new Date(Date.now() + settings.deadlineMinutes * 60_000).toISOString()
      : null;

    const { data: pollId, error } = await supabase.rpc("create_poll_with_options", {
      p_question: question.trim(),
      p_options: options.map((label) => label.trim()),
      p_require_all: settings.requireAll,
      p_send_push_on_create: settings.sendPushOnCreate,
      p_send_push_on_resolved: settings.sendPushOnResolved,
      p_deadline_at: deadlineAt,
      p_min_votes: settings.minVotes,
      p_trip_id: selectedTripId,
    } as never);

    if (error || !pollId) {
      errorToast(error?.message || "Kunne ikke opprette avstemming");
      return null;
    }

    // Push
    if (settings.sendPushOnCreate) {
      supabase.functions.invoke("poll-push", {
        body: { poll_id: pollId, type: "created" },
      }).catch(console.warn);
    }

    toast.success("Avstemming opprettet!");

    // Chat system message
    const { data: prof } = await supabase.from("profiles").select("nickname, full_name").eq("id", user.id).single();
    const creatorName = prof?.nickname || prof?.full_name || "Noen";
    postPollChatMessage(
      user.id,
      `${creatorName} har startet en avstemming: "${question.trim()}"`,
      pollId,
      "created",
      selectedTripId,
    ).catch(console.warn);

    await fetchPolls();
    return pollId;
  };

  const vote = async (pollId: string, optionId: string) => {
    if (!user) return;
    if (blockedByArchive()) return;

    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.status !== "active") {
      errorToast("Avstemmingen er lukket");
      return;
    }

    // Check deadline
    if (poll.deadline_at && new Date(poll.deadline_at) < new Date()) {
      errorToast("Tidsfristen er utløpt");
      return;
    }

    const { data: existing } = await supabase
      .from("poll_votes")
      .select("id")
      .eq("poll_id", pollId)
      .eq("user_id", user.id)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("poll_votes")
        .update({ option_id: optionId })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("poll_votes")
        .insert({ poll_id: pollId, option_id: optionId, user_id: user.id, trip_id: tripRef.current } as never));
    }

    if (error) {
      console.error("Vote error:", error);
      errorToast("Kunne ikke stemme");
      return;
    }

    await fetchPolls();
    await checkResolution(pollId);
  };

  const checkResolution = async (pollId: string) => {
    const { data: pollData } = await supabase.from("polls").select("*").eq("id", pollId).single();
    if (!pollData || pollData.status !== "active") return;

    const { data: votes } = await supabase.from("poll_votes").select("*").eq("poll_id", pollId);
    const { data: profiles } = await supabase.from("profiles").select("id").eq("is_active", true);

    const totalUsers = profiles?.length || 0;
    const totalVotes = votes?.length || 0;

    // Check quorum
    const minVotes = pollData.min_votes;
    if (minVotes && totalVotes < minVotes) return;

    // Check require_all
    if (pollData.require_all && totalVotes >= totalUsers) {
      await resolvePoll(pollId);
    }
  };

  const resolvePoll = async (pollId: string) => {
    if (!user) return;
    const { data: votes } = await supabase.from("poll_votes").select("option_id").eq("poll_id", pollId);
    if (!votes || votes.length === 0) {
      // No votes → just close
      await supabase.from("polls").update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
      }).eq("id", pollId);
      await fetchPolls();
      return;
    }

    const counts = new Map<string, number>();
    votes.forEach((v) => counts.set(v.option_id, (counts.get(v.option_id) || 0) + 1));

    let winnerId = "";
    let maxCount = 0;
    const tiedIds: string[] = [];

    counts.forEach((count, id) => {
      if (count > maxCount) {
        maxCount = count;
        winnerId = id;
        tiedIds.length = 0;
        tiedIds.push(id);
      } else if (count === maxCount) {
        tiedIds.push(id);
      }
    });

    // If tie → don't auto-resolve, let creator choose
    if (tiedIds.length > 1) {
      await fetchPolls();
      return;
    }

    await supabase.from("polls").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      winning_option_id: winnerId,
    }).eq("id", pollId);

    // Find label
    const { data: winOpt } = await supabase.from("poll_options").select("label").eq("id", winnerId).single();
    const { data: pollRow } = await supabase.from("polls").select("question, send_push_on_resolved").eq("id", pollId).single();

    if (pollRow && winOpt) {
      postPollChatMessage(
        user.id,
        `Avstemming avgjort: "${pollRow.question}"\n🏆 Resultat: ${winOpt.label}`,
        pollId,
        "ended",
        tripRef.current,
      ).catch(console.warn);

    }

    if (pollRow?.send_push_on_resolved) {
      supabase.functions.invoke("poll-push", {
        body: { poll_id: pollId, type: "resolved" },
      }).catch(console.warn);
    }

    await fetchPolls();
  };

  /** Creator resolves a tie by choosing the winning option */
  const resolveTie = async (pollId: string, winningOptionId: string) => {
    if (!user) return;
    if (blockedByArchive()) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.created_by !== user.id) {
      errorToast("Bare oppretteren kan avgjøre uavgjort");
      return;
    }

    await supabase.from("polls").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      winning_option_id: winningOptionId,
    }).eq("id", pollId);

    const winOpt = poll.options.find((o) => o.id === winningOptionId);
    postPollChatMessage(
      user.id,
      `Avstemming avgjort: "${poll.question}"\n🏆 Resultat: ${winOpt?.label || "Ukjent"} (oppretter avgjorde uavgjort)`,
      pollId,
      "ended",
      tripRef.current,
    ).catch(console.warn);

    if (poll.send_push_on_resolved) {
      supabase.functions.invoke("poll-push", {
        body: { poll_id: pollId, type: "resolved" },
      }).catch(console.warn);
    }

    toast.success("Uavgjort avgjort!");
    await fetchPolls();
  };

  /** Force close by creator with warning about missing voters */
  const forceClose = async (pollId: string) => {
    if (!user) return;
    if (blockedByArchive()) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;
    if (poll.created_by !== user.id) {
      errorToast("Bare oppretteren kan avslutte");
      return;
    }

    await resolvePoll(pollId);
  };

  /** Cancel poll (only creator) */
  const cancelPoll = async (pollId: string) => {
    if (!user) return;
    if (blockedByArchive()) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.created_by !== user.id) {
      errorToast("Bare oppretteren kan kansellere");
      return;
    }

    await supabase.from("polls").update({
      status: "cancelled",
      resolved_at: new Date().toISOString(),
    }).eq("id", pollId);

    postPollChatMessage(
      user.id,
      `Avstemming kansellert: "${poll.question}"`,
      pollId,
      "cancelled",
      tripRef.current,
    ).catch(console.warn);

    supabase.functions.invoke("poll-push", {
      body: { poll_id: pollId, type: "cancelled" },
    }).catch(console.warn);

    toast.success("Avstemming kansellert");
    await fetchPolls();
  };

  /** Toggle pin (creator or admin) */
  const togglePin = async (pollId: string) => {
    if (blockedByArchive()) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) return;
    await supabase.from("polls").update({ is_pinned: !poll.is_pinned }).eq("id", pollId);
    await fetchPolls();
  };

  /** Send reminder push to non-voters */
  const sendReminder = async (pollId: string) => {
    if (!user) return;
    if (blockedByArchive()) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.status !== "active") return;

    try {
      await supabase.functions.invoke("poll-push", {
        body: { poll_id: pollId, type: "reminder" },
      });
      toast.success("Påminnelse sendt!");
    } catch {
      errorToast("Kunne ikke sende påminnelse");
    }
  };

  return {
    polls,
    loading,
    createPoll,
    vote,
    forceClose,
    cancelPoll,
    resolveTie,
    togglePin,
    sendReminder,
    refetch: fetchPolls,
  };
}
