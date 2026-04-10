/**
 * ShotHistory – Personal shot history for current user
 * Shows all events where the user was involved (drawn, started, witnessed)
 */

import * as React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { History, ChevronDown, ChevronUp } from "lucide-react";

interface HistoryEvent {
  id: string;
  created_at: string;
  status: string;
  selected_user_id: string | null;
  started_by: string;
  self_confirmed: boolean;
  witness_confirmed_by: string | null;
  chosen_witness_id: string | null;
  deadline_at: string | null;
}

interface ShotHistoryProps {
  getDisplayName: (id: string | null) => string;
}

export const ShotHistory: React.FC<ShotHistoryProps> = ({ getDisplayName }) => {
  const { user } = useAuth();
  const [events, setEvents] = React.useState<HistoryEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get events where user was drawn, started, or witnessed
      const { data } = await supabase
        .from("shot_events")
        .select("id, created_at, status, selected_user_id, started_by, self_confirmed, witness_confirmed_by, chosen_witness_id, deadline_at")
        .or(`selected_user_id.eq.${user.id},started_by.eq.${user.id},witness_confirmed_by.eq.${user.id},chosen_witness_id.eq.${user.id}`)
        .in("status", ["confirmed", "punished"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) setEvents(data as unknown as HistoryEvent[]);
      setLoading(false);
    };
    load();
  }, [user]);

  if (!user) return null;

  const myDraws = events.filter(e => e.selected_user_id === user.id);
  const myStarts = events.filter(e => e.started_by === user.id);
  const myWitness = events.filter(e => e.witness_confirmed_by === user.id || e.chosen_witness_id === user.id);
  const myPenalties = myDraws.filter(e => e.status === "punished");
  const myConfirmed = myDraws.filter(e => e.status === "confirmed");

  // Streak: consecutive confirmed draws without punishment
  let currentStreak = 0;
  for (const e of myDraws) {
    if (e.status === "confirmed") currentStreak++;
    else break;
  }

  const getEventDescription = (e: HistoryEvent): { emoji: string; text: string } => {
    const isMyDraw = e.selected_user_id === user.id;
    const isMyStart = e.started_by === user.id;
    const isMyWitness = e.witness_confirmed_by === user.id || e.chosen_witness_id === user.id;

    if (isMyDraw && e.status === "confirmed") {
      return { emoji: "✅", text: "Du tok shotten – bekreftet!" };
    }
    if (isMyDraw && e.status === "punished") {
      if (e.witness_confirmed_by && !e.self_confirmed) {
        return { emoji: "💀", text: "Straffeshot – du nektet" };
      }
      if (e.witness_confirmed_by) {
        return { emoji: "💀", text: "Straffeshot – avvist av vitne" };
      }
      return { emoji: "💀", text: "Straffeshot – ikke tatt i tide" };
    }
    if (isMyWitness) {
      return { emoji: "👁", text: `Vitne for ${getDisplayName(e.selected_user_id)}` };
    }
    if (isMyStart) {
      return { emoji: "🔴", text: `Du startet runden → ${getDisplayName(e.selected_user_id)} ble trukket` };
    }
    return { emoji: "•", text: "Hendelse" };
  };

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between mb-3"
      >
        <h2 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
          <History size={14} />
          Mine shots
        </h2>
        {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold tabular-nums">{myDraws.length}</p>
          <p className="text-[10px] text-muted-foreground">Trukket</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold tabular-nums text-success">{myConfirmed.length}</p>
          <p className="text-[10px] text-muted-foreground">Bekreftet</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold tabular-nums text-destructive">{myPenalties.length}</p>
          <p className="text-[10px] text-muted-foreground">Straff</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-lg font-bold tabular-nums">🔥 {currentStreak}</p>
          <p className="text-[10px] text-muted-foreground">Streak</p>
        </div>
      </div>

      {expanded && (
        loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Ingen historikk ennå</p>
        ) : (
          <div className="space-y-0">
            {events.map(e => {
              const { emoji, text } = getEventDescription(e);
              const timeAgo = formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: nb });
              return (
                <div key={e.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                  <span className="text-base mt-0.5 shrink-0">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{text}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </section>
  );
};
