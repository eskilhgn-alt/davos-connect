/**
 * PollCard – Single poll display with voting
 */

import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { cn } from "@/lib/utils";
import { Check, Clock, Crown, Lock, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import type { Poll } from "@/hooks/usePolls";

interface PollCardProps {
  poll: Poll;
  onVote: (pollId: string, optionId: string) => void;
  onClose: (pollId: string) => void;
  isCreator: boolean;
}

export const PollCard: React.FC<PollCardProps> = ({ poll, onVote, onClose, isCreator }) => {
  const isResolved = poll.status === "resolved";
  const hasVoted = !!poll.my_vote;
  const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 1);

  const timeLeft = poll.deadline_at
    ? formatDistanceToNow(new Date(poll.deadline_at), { locale: nb, addSuffix: true })
    : null;

  const isExpired = poll.deadline_at ? new Date(poll.deadline_at) < new Date() : false;

  return (
    <DavosCard className={cn(isResolved && "opacity-80")}>
      <DavosCardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="font-heading font-semibold text-foreground text-base leading-snug">
              {poll.question}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {poll.creator_name} · {formatDistanceToNow(new Date(poll.created_at), { locale: nb, addSuffix: true })}
            </p>
          </div>
          {isResolved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              <Crown size={12} /> Avgjort
            </span>
          )}
        </div>

        {/* Meta badges */}
        <div className="flex flex-wrap gap-1.5">
          {poll.require_all && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              <Users size={10} /> Alle må svare
            </span>
          )}
          {timeLeft && !isResolved && (
            <span className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full",
              isExpired ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-muted"
            )}>
              <Clock size={10} /> {isExpired ? "Utløpt" : timeLeft}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {poll.total_votes}/{poll.total_users} har stemt
          </span>
        </div>

        {/* Options */}
        <div className="space-y-1.5">
          {poll.options.map((opt) => {
            const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0;
            const isMyVote = poll.my_vote === opt.id;
            const isWinner = poll.winning_option_id === opt.id;

            return (
              <button
                key={opt.id}
                onClick={() => {
                  if (!isResolved && !isExpired) onVote(poll.id, opt.id);
                }}
                disabled={isResolved || isExpired}
                className={cn(
                  "relative w-full text-left rounded-xl overflow-hidden transition-all",
                  "border",
                  isMyVote ? "border-primary" : "border-border",
                  isWinner && isResolved && "border-primary ring-1 ring-primary/20",
                  !isResolved && !isExpired && "active:scale-[0.99]"
                )}
              >
                {/* Bar background */}
                {(hasVoted || isResolved) && (
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 transition-all duration-500",
                      isWinner ? "bg-primary/15" : "bg-muted/60"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                )}

                <div className="relative flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {isMyVote && (
                      <Check size={14} className="text-primary flex-shrink-0" />
                    )}
                    {isWinner && isResolved && !isMyVote && (
                      <Crown size={14} className="text-primary flex-shrink-0" />
                    )}
                    <span className={cn(
                      "text-sm",
                      isMyVote || isWinner ? "font-semibold text-foreground" : "text-foreground"
                    )}>
                      {opt.label}
                    </span>
                  </div>
                  {(hasVoted || isResolved) && (
                    <span className="text-xs font-medium text-muted-foreground ml-2 tabular-nums">
                      {pct}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Creator controls */}
        {isCreator && !isResolved && poll.total_votes > 0 && (
          <DavosButton
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onClose(poll.id)}
          >
            <Lock size={14} className="mr-1.5" />
            Avslutt avstemming
          </DavosButton>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
