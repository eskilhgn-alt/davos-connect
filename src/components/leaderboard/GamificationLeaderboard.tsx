/**
 * GamificationLeaderboard – comprehensive stats for all users
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Mountain, Target, MessageCircle, Camera, Flame, Trophy, Eye, Ban, Ticket } from "lucide-react";

interface GamEntry {
  user_id: string;
  display_name: string;
  total_points: number;
  current_streak: number;
  best_streak: number;
  token_balance: number;
  shots_selected: number;
  shots_confirmed: number;
  shots_punished: number;
  shots_refused: number;
  rounds_started: number;
  times_witnessed: number;
  ski_total_vertical: number;
  ski_active_days: number;
  ski_today_vertical: number;
  frikort_earned: number;
  frikort_used: number;
  frikort_available: number;
  messages_sent: number;
  media_shared: number;
  stories_posted: number;
  shot_success_rate: number;
}

type SortKey = "total_points" | "ski_total_vertical" | "shots_selected" | "current_streak" | "messages_sent" | "shots_confirmed";

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: "total_points", label: "Poeng", icon: <Trophy size={12} /> },
  { key: "ski_total_vertical", label: "Høydemeter", icon: <Mountain size={12} /> },
  { key: "shots_selected", label: "Shots trukket", icon: <Target size={12} /> },
  { key: "current_streak", label: "Streak", icon: <Flame size={12} /> },
  { key: "messages_sent", label: "Meldinger", icon: <MessageCircle size={12} /> },
  { key: "shots_confirmed", label: "Shots tatt", icon: <Target size={12} /> },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export const GamificationLeaderboard: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = React.useState<GamEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<SortKey>("total_points");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.rpc("rpc_get_gamification_leaderboard").then(({ data: res }) => {
      if (res) setData(res as unknown as GamEntry[]);
      setLoading(false);
    });
  }, []);

  const sorted = React.useMemo(() => {
    return [...data].sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));
  }, [data, sortBy]);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Ingen data ennå</p>;

  return (
    <div className="space-y-3">
      {/* Sort pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {SORT_OPTIONS.map(opt => (
          <button key={opt.key} type="button" onClick={() => setSortBy(opt.key)}
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors",
              sortBy === opt.key ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="space-y-0">
        {sorted.map((entry, idx) => {
          const isMe = entry.user_id === user?.id;
          const isExpanded = expanded === entry.user_id;
          return (
            <div key={entry.user_id}>
              <button type="button" onClick={() => setExpanded(isExpanded ? null : entry.user_id)}
                className={cn("w-full flex items-center gap-3 py-3 px-2 border-b border-border text-left transition-colors",
                  isMe && "bg-primary/5 rounded-t-lg")}>
                <span className="w-7 text-center text-base shrink-0">
                  {idx < 3 ? MEDALS[idx] : `#${idx + 1}`}
                </span>
                <span className={cn("flex-1 text-sm truncate", isMe && "font-semibold")}>
                  {entry.display_name}
                </span>
                <span className="text-sm font-mono font-semibold tabular-nums">
                  {sortBy === "ski_total_vertical" ? `${Math.round(entry.ski_total_vertical)}m` : entry[sortBy]}
                </span>
              </button>
              
              {/* Expanded detail */}
              {isExpanded && (
                <div className={cn("grid grid-cols-3 gap-2 p-3 border-b border-border bg-muted/20", isMe && "rounded-b-lg")}>
                  <StatCell icon={<Trophy size={12} />} label="Poeng" value={entry.total_points} />
                  <StatCell icon={<Flame size={12} />} label="Streak" value={`${entry.current_streak}d`} />
                  <StatCell icon={<Flame size={12} />} label="Beste" value={`${entry.best_streak}d`} />
                  <StatCell icon={<Target size={12} />} label="Trukket" value={entry.shots_selected} />
                  <StatCell icon={<Target size={12} />} label="Tatt" value={entry.shots_confirmed} />
                  <StatCell icon={<Ban size={12} />} label="Straff" value={entry.shots_punished} />
                  <StatCell icon={<Ban size={12} />} label="Nektet" value={entry.shots_refused} highlight={entry.shots_refused > 0} />
                  <StatCell icon={<Eye size={12} />} label="Vitnet" value={entry.times_witnessed} />
                  <StatCell icon={<Target size={12} />} label="Startet" value={entry.rounds_started} />
                  <StatCell icon={<Mountain size={12} />} label="Hm totalt" value={`${Math.round(entry.ski_total_vertical)}m`} />
                  <StatCell icon={<Mountain size={12} />} label="Hm i dag" value={`${Math.round(entry.ski_today_vertical)}m`} />
                  <StatCell icon={<Mountain size={12} />} label="Ski-dager" value={entry.ski_active_days} />
                  <StatCell icon={<Ticket size={12} />} label="Frikort" value={`${entry.frikort_available}/${entry.frikort_earned}`} />
                  <StatCell icon={<MessageCircle size={12} />} label="Meldinger" value={entry.messages_sent} />
                  <StatCell icon={<Camera size={12} />} label="Media" value={entry.media_shared} />
                  <StatCell icon={<Camera size={12} />} label="Stories" value={entry.stories_posted} />
                  <StatCell icon={<Target size={12} />} label="Suksessrate" value={`${entry.shot_success_rate}%`} />
                  <StatCell icon={<Trophy size={12} />} label="Tokens" value={entry.token_balance} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatCell: React.FC<{ icon: React.ReactNode; label: string; value: string | number; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className={cn("flex flex-col items-center p-2 rounded-lg bg-background border border-border", highlight && "border-destructive/30 bg-destructive/5")}>
    <span className="text-muted-foreground mb-0.5">{icon}</span>
    <span className={cn("text-sm font-semibold tabular-nums", highlight && "text-destructive")}>{value}</span>
    <span className="text-[9px] text-muted-foreground">{label}</span>
  </div>
);
