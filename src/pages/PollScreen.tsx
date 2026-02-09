/**
 * PollScreen – Avstemminger for gruppen
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { usePolls } from "@/hooks/usePolls";
import { useAuth } from "@/contexts/AuthContext";
import { PollCard } from "@/components/poll/PollCard";
import { CreatePollSheet } from "@/components/poll/CreatePollSheet";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { Plus, Vote } from "lucide-react";

export const PollScreen: React.FC = () => {
  const { polls, loading, createPoll, vote, closePoll } = usePolls();
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = React.useState(false);

  const activePolls = polls.filter((p) => p.status === "active");
  const resolvedPolls = polls.filter((p) => p.status === "resolved");

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Avstemminger"
        subtitle="Demokrati i aksjon"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          <button
            onClick={() => setCreateOpen(true)}
            className="tap-target flex items-center justify-center text-foreground"
          >
            <Plus size={22} strokeWidth={1.8} />
          </button>
        }
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-4 pb-10">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <DavosSkeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : polls.length === 0 ? (
            <DavosEmptyState
              icon={Vote}
              title="Ingen avstemminger ennå"
              description="Opprett den første og la Gütta bestemme!"
            />
          ) : (
            <>
              {activePolls.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Aktive
                  </h2>
                  {activePolls.map((poll) => (
                    <PollCard
                      key={poll.id}
                      poll={poll}
                      onVote={vote}
                      onClose={closePoll}
                      isCreator={poll.created_by === user?.id}
                    />
                  ))}
                </div>
              )}

              {resolvedPolls.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Avgjort
                  </h2>
                  {resolvedPolls.map((poll) => (
                    <PollCard
                      key={poll.id}
                      poll={poll}
                      onVote={vote}
                      onClose={closePoll}
                      isCreator={poll.created_by === user?.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CreatePollSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (q, opts, settings) => {
          const id = await createPoll(q, opts, settings);
          if (id) setCreateOpen(false);
        }}
      />
    </div>
  );
};

export default PollScreen;
