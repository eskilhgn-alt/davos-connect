/**
 * PollCard – Rich poll display with voting, voter names, tie handling, actions
 */

import * as React from "react";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { cn } from "@/lib/utils";
import { Check, Clock, Crown, Lock, Users, Pin, Bell, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import type { Poll } from "@/hooks/usePolls";

interface PollCardProps {
  poll: Poll;
  onVote: (pollId: string, optionId: string) => void;
  onForceClose: (pollId: string) => void;
  onCancel: (pollId: string) => void;
  onResolveTie: (pollId: string, optionId: string) => void;
  onTogglePin: (pollId: string) => void;
  onSendReminder: (pollId: string) => void;
  isCreator: boolean;
  isAdmin: boolean;
}

export const PollCard: React.FC<PollCardProps> = ({
  poll,
  onVote,
  onForceClose,
  onCancel,
  onResolveTie,
  onTogglePin,
  onSendReminder,
  isCreator,
  isAdmin,
}) => {
  const isResolved = poll.status === "resolved";
  const isCancelled = poll.status === "cancelled";
  const isEnded = isResolved || isCancelled;
  const hasVoted = !!poll.my_vote;
  const [showMissing, setShowMissing] = React.useState(false);
  const [showVoters, setShowVoters] = React.useState<string | null>(null);

  const timeLeft = poll.deadline_at
    ? formatDistanceToNow(new Date(poll.deadline_at), { locale: nb, addSuffix: true })
    : null;

  const isExpired = poll.deadline_at ? new Date(poll.deadline_at) < new Date() : false;
  const canVote = !isEnded && !isExpired;

  return (
    <DavosCard className={cn(isEnded && "opacity-75")}>
      <DavosCardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              {poll.is_pinned && <Pin size={12} className="text-primary flex-shrink-0" />}
              <h3 className="font-heading font-semibold text-foreground text-base leading-snug">
                {poll.question}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {poll.creator_name} · {formatDistanceToNow(new Date(poll.created_at), { locale: nb, addSuffix: true })}
            </p>
          </div>
          {isResolved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              <Crown size={12} /> Avgjort
            </span>
          )}
          {isCancelled && (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
              <X size={12} /> Kansellert
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
          {poll.min_votes && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              <Users size={10} /> Min. {poll.min_votes} svar
            </span>
          )}
          {timeLeft && !isEnded && (
            <span className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full",
              isExpired ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-muted"
            )}>
              <Clock size={10} /> {isExpired ? "Utløpt" : timeLeft}
            </span>
          )}
          <button
            onClick={() => setShowMissing(!showMissing)}
            className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full active:bg-muted/80"
          >
            {poll.total_votes}/{poll.total_users} har stemt
            {!isEnded && poll.missing_voters.length > 0 && (
              showMissing ? <ChevronUp size={10} className="inline ml-0.5" /> : <ChevronDown size={10} className="inline ml-0.5" />
            )}
          </button>
        </div>

        {/* Missing voters */}
        {showMissing && !isEnded && poll.missing_voters.length > 0 && (
          <div className="bg-muted/50 rounded-xl px-3 py-2">
            <p className="text-[10px] text-muted-foreground font-medium mb-1">Mangler svar fra:</p>
            <p className="text-xs text-foreground">
              {poll.missing_voters.map((v) => v.display_name).join(", ")}
            </p>
          </div>
        )}

        {/* Tie warning */}
        {poll.is_tie && !isEnded && poll.total_votes > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">Uavgjort!</p>
              {isCreator && (
                <p className="text-[10px] text-muted-foreground">Velg vinneren blant de uavgjorte alternativene nedenfor</p>
              )}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="space-y-1.5">
          {poll.options.map((opt) => {
            const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0;
            const isMyVote = poll.my_vote === opt.id;
            const isWinner = poll.winning_option_id === opt.id;
            const isTied = poll.is_tie && poll.tied_option_ids.includes(opt.id);
            const isVotersOpen = showVoters === opt.id;

            return (
              <div key={opt.id} className="space-y-0.5">
                <button
                  onClick={() => {
                    if (poll.is_tie && isCreator && !isEnded && isTied) {
                      // Creator breaks tie
                      onResolveTie(poll.id, opt.id);
                    } else if (canVote) {
                      onVote(poll.id, opt.id);
                    } else if (hasVoted || isEnded) {
                      setShowVoters(isVotersOpen ? null : opt.id);
                    }
                  }}
                  disabled={isCancelled}
                  className={cn(
                    "relative w-full text-left rounded-xl overflow-hidden transition-all",
                    "border",
                    isMyVote ? "border-primary" : isTied && isCreator && !isEnded ? "border-amber-500" : "border-border",
                    isWinner && isResolved && "border-primary ring-1 ring-primary/20",
                    canVote && "active:scale-[0.99]"
                  )}
                >
                  {/* Bar background */}
                  {(hasVoted || isEnded) && (
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 transition-all duration-500",
                        isWinner ? "bg-primary/15" : isTied ? "bg-amber-500/10" : "bg-muted/60"
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
                      {isTied && isCreator && !isEnded && (
                        <Crown size={14} className="text-amber-500 flex-shrink-0" />
                      )}
                      <span className={cn(
                        "text-sm",
                        isMyVote || isWinner ? "font-semibold text-foreground" : "text-foreground"
                      )}>
                        {opt.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {opt.vote_count > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {opt.vote_count}
                        </span>
                      )}
                      {(hasVoted || isEnded) && (
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Voter names expandable */}
                {isVotersOpen && opt.voters.length > 0 && (
                  <div className="ml-3 px-2 py-1">
                    <p className="text-[10px] text-muted-foreground">
                      {opt.voters.map((v) => v.display_name).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Creator controls */}
        {(isCreator || isAdmin) && !isEnded && (
          <div className="flex flex-wrap gap-2">
            {poll.total_votes > 0 && !poll.is_tie && (
              <DavosButton
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onForceClose(poll.id)}
              >
                <Lock size={14} className="mr-1.5" />
                Avslutt
              </DavosButton>
            )}
            <DavosButton
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onCancel(poll.id)}
            >
              <X size={14} className="mr-1.5" />
              Kanseller
            </DavosButton>
            {poll.missing_voters.length > 0 && (
              <DavosButton
                variant="outline"
                size="sm"
                onClick={() => onSendReminder(poll.id)}
              >
                <Bell size={14} className="mr-1.5" />
                Påminn
              </DavosButton>
            )}
            <DavosButton
              variant="outline"
              size="sm"
              onClick={() => onTogglePin(poll.id)}
            >
              <Pin size={14} className={cn("mr-1.5", poll.is_pinned && "text-primary")} />
              {poll.is_pinned ? "Løsne" : "Fest"}
            </DavosButton>
          </div>
        )}
      </DavosCardContent>
    </DavosCard>
  );
};
