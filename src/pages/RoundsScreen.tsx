/**
 * RoundsScreen – Track who bought rounds of drinks
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useRounds, RoundSummary } from "@/hooks/useRounds";
import { useAuth } from "@/contexts/AuthContext";
import { DavosSegmented } from "@/components/ui/davos-segmented";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Beer, Wine, Zap, Plus, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AddRoundSheet } from "@/components/rounds/AddRoundSheet";

const DRINK_ICONS: Record<string, React.ElementType> = {
  beer: Beer,
  drink: Wine,
  shots: Zap,
};

const DRINK_LABELS: Record<string, string> = {
  beer: "Øl",
  drink: "Drinker",
  shots: "Shots",
};

export const RoundsScreen: React.FC = () => {
  const { rounds, summaries, profiles, loading } = useRounds();
  const [tab, setTab] = React.useState("oversikt");
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Runder" leftAction={<BackButton />} rightAction={
        <button onClick={() => setSheetOpen(true)} className="tap-target flex items-center justify-center text-primary" aria-label="Legg til runde">
          <Plus size={22} strokeWidth={2} />
        </button>
      } />

      <div className="px-4 pt-3">
        <DavosSegmented
          options={[
            { value: "oversikt", label: "Oversikt" },
            { value: "historikk", label: "Historikk" },
          ]}
          value={tab}
          onChange={setTab}
          className="w-full"
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-10" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <DavosSkeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : tab === "oversikt" ? (
          <OverviewTab summaries={summaries} />
        ) : (
          <HistoryTab rounds={rounds} profiles={profiles} />
        )}
      </div>

      <AddRoundSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
};

/* ---------- Overview Tab ---------- */
const OverviewTab: React.FC<{ summaries: RoundSummary[] }> = ({ summaries }) => {
  if (summaries.length === 0) {
    return <DavosEmptyState icon={Beer} title="Ingen runder ennå" description="Trykk + for å registrere en runde" />;
  }

  return (
    <div className="space-y-2">
      {summaries.map((s, i) => {
        const displayName = s.nickname || s.full_name || "Ukjent";
        const initials = (s.full_name || "?").slice(0, 2).toUpperCase();
        return (
          <div key={s.user_id} className={cn(
            "flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30",
            i === 0 && "border-primary/30 bg-primary/5"
          )}>
            <span className="text-sm font-bold text-muted-foreground w-5 text-center">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
            </span>
            <Avatar className="h-9 w-9">
              {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-sm font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {s.rounds_bought} kjøpt · {s.rounds_received} mottatt
              </p>
            </div>
            <div className="text-right">
              <p className="font-heading text-sm font-bold text-foreground">{s.total_spent.toLocaleString("no")} kr</p>
              <p className="text-[10px] text-muted-foreground">spandert</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ---------- History Tab ---------- */
const HistoryTab: React.FC<{
  rounds: ReturnType<typeof useRounds>["rounds"];
  profiles: ReturnType<typeof useRounds>["profiles"];
}> = ({ rounds, profiles }) => {
  if (rounds.length === 0) {
    return <DavosEmptyState icon={Clock} title="Ingen historikk" description="Runder du registrerer vises her" />;
  }

  return (
    <div className="space-y-3">
      {rounds.map((r) => {
        const buyer = profiles[r.buyer_id];
        const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
        const DrinkIcon = DRINK_ICONS[r.drink_type] || Beer;
        const drinkLabel = DRINK_LABELS[r.drink_type] || r.drink_type;

        return (
          <div key={r.id} className="p-3 rounded-xl border border-border bg-muted/20 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <DrinkIcon size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-sm font-semibold text-foreground">
                  {buyerName} spanderte {drinkLabel.toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(r.created_at), "d. MMM yyyy, HH:mm", { locale: nb })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-heading text-sm font-bold text-foreground">{r.total_cost} kr</p>
                <p className="text-[10px] text-muted-foreground">{r.cost_per_person} kr/pers</p>
              </div>
            </div>
            {/* Participants */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Users size={12} className="text-muted-foreground" />
              <div className="flex -space-x-1.5">
                {r.participants.slice(0, 8).map((p) => {
                  const prof = profiles[p.user_id];
                  return (
                    <Avatar key={p.user_id} className="h-6 w-6 border-2 border-background">
                      {prof?.avatar_url ? <AvatarImage src={prof.avatar_url} /> : null}
                      <AvatarFallback className="text-[8px]">{(prof?.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  );
                })}
                {r.participants.length > 8 && (
                  <span className="text-[10px] text-muted-foreground ml-1.5">+{r.participants.length - 8}</span>
                )}
              </div>
              {r.note && <span className="text-xs text-muted-foreground italic ml-auto truncate max-w-[120px]">{r.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RoundsScreen;
