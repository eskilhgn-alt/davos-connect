/**
 * PollScreen – Full poll management with filters, pinned polls, and actions
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { usePolls } from "@/hooks/usePolls";
import { useAuth } from "@/contexts/AuthContext";
import { PollCard } from "@/components/poll/PollCard";
import { CreatePollSheet } from "@/components/poll/CreatePollSheet";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { Plus, Vote } from "lucide-react";
import { cn } from "@/lib/utils";
import { markPageSeen } from "@/hooks/useAppBadges";

type Filter = "active" | "resolved" | "mine";

export const PollScreen: React.FC = () => {
  React.useEffect(() => { markPageSeen("polls"); }, []);
  const {
    polls,
    loading,
    createPoll,
    vote,
    forceClose,
    cancelPoll,
    resolveTie,
    togglePin,
    sendReminder,
  } = usePolls();
  const { user, isAdmin } = useAuth();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("active");

  const pinnedPolls = polls.filter((p) => p.is_pinned && p.status === "active");
  
  const filteredPolls = React.useMemo(() => {
    switch (filter) {
      case "active":
        return polls.filter((p) => p.status === "active" && !p.is_pinned);
      case "resolved":
        return polls.filter((p) => p.status === "resolved" || p.status === "cancelled");
      case "mine":
        return polls.filter((p) => p.created_by === user?.id);
      default:
        return polls;
    }
  }, [polls, filter, user]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: "Aktive", count: polls.filter((p) => p.status === "active").length },
    { key: "resolved", label: "Avgjort", count: polls.filter((p) => p.status !== "active").length },
    { key: "mine", label: "Mine", count: polls.filter((p) => p.created_by === user?.id).length },
  ];

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

      {/* Filter tabs */}
      <div className="px-4 pt-2 pb-1 flex gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {f.label} {f.count > 0 && `(${f.count})`}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-4 pb-10">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <BrandSkeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : filteredPolls.length === 0 && pinnedPolls.length === 0 ? (
            <BrandEmptyState
              icon={Vote}
              title={filter === "active" ? "Ingen aktive avstemminger" : filter === "mine" ? "Du har ingen avstemminger" : "Ingen avgjorte avstemminger"}
              description="Opprett den første og la Gütta bestemme!"
            />
          ) : (
            <>
              {/* Pinned polls (only in active filter) */}
              {filter === "active" && pinnedPolls.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    📌 Festet
                  </h2>
                  {pinnedPolls.map((poll) => (
                    <PollCard
                      key={poll.id}
                      poll={poll}
                      onVote={vote}
                      onForceClose={forceClose}
                      onCancel={cancelPoll}
                      onResolveTie={resolveTie}
                      onTogglePin={togglePin}
                      onSendReminder={sendReminder}
                      isCreator={poll.created_by === user?.id}
                      isAdmin={!!isAdmin}
                    />
                  ))}
                </div>
              )}

              {/* Regular polls */}
              <div className="space-y-3">
                {filter === "active" && filteredPolls.length > 0 && pinnedPolls.length > 0 && (
                  <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Alle aktive
                  </h2>
                )}
                {filteredPolls.map((poll) => (
                  <PollCard
                    key={poll.id}
                    poll={poll}
                    onVote={vote}
                    onForceClose={forceClose}
                    onCancel={cancelPoll}
                    onResolveTie={resolveTie}
                    onTogglePin={togglePin}
                    onSendReminder={sendReminder}
                    isCreator={poll.created_by === user?.id}
                    isAdmin={!!isAdmin}
                  />
                ))}
              </div>
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
