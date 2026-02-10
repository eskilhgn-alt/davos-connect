/**
 * RoundsScreen – Track who bought rounds of drinks
 * Single-view: summary cards at top, history feed below
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useRounds } from "@/hooks/useRounds";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Beer, Wine, Zap, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AddRoundSheet } from "@/components/rounds/AddRoundSheet";

const DRINK_ICONS: Record<string, React.ElementType> = { beer: Beer, drink: Wine, shots: Zap };
const DRINK_LABELS: Record<string, string> = { beer: "Øl", drink: "Drinker", shots: "Shots" };

export const RoundsScreen: React.FC = () => {
  const { rounds, summaries, profiles, loading, addRound } = useRounds();
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Runder" leftAction={<BackButton />} rightAction={
        <button onClick={() => setSheetOpen(true)} className="tap-target flex items-center justify-center text-primary" aria-label="Legg til runde">
          <Plus size={22} strokeWidth={2} />
        </button>
      } />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-10" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <DavosSkeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : rounds.length === 0 ? (
          <DavosEmptyState icon={Beer} title="Ingen runder ennå" description="Trykk + for å registrere den første runden" />
        ) : (
          <div className="space-y-5">
            {/* Summary cards */}
            {summaries.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Oversikt</p>
                <div className="space-y-1.5">
                  {summaries.map((s, i) => {
                    const displayName = s.nickname || s.full_name || "Ukjent";
                    const initials = (s.full_name || "?").slice(0, 2).toUpperCase();
                    return (
                      <div key={s.user_id} className={cn(
                        "flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30",
                        i === 0 && "border-primary/30 bg-primary/5"
                      )}>
                        <span className="text-sm font-bold text-muted-foreground w-5 text-center">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                        </span>
                        <Avatar className="h-8 w-8">
                          {s.avatar_url ? <AvatarImage src={s.avatar_url} /> : null}
                          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-heading text-sm font-semibold text-foreground truncate">{displayName}</p>
                          <p className="text-[11px] text-muted-foreground">{s.rounds_bought} kjøpt · {s.rounds_received} mottatt</p>
                        </div>
                        <p className="font-heading text-sm font-bold text-foreground shrink-0">{s.total_spent.toLocaleString("no")} kr</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* History feed */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Historikk</p>
              <div className="space-y-2">
                {rounds.map((r) => {
                  const buyer = profiles[r.buyer_id];
                  const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
                  const DrinkIcon = DRINK_ICONS[r.drink_type] || Beer;
                  const drinkLabel = DRINK_LABELS[r.drink_type] || r.drink_type;

                  return (
                    <div key={r.id} className="p-3 rounded-xl border border-border bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <DrinkIcon size={16} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-heading text-sm font-semibold text-foreground truncate">
                            {buyerName} – {drinkLabel.toLowerCase()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(r.created_at), "d. MMM yyyy, HH:mm", { locale: nb })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-heading text-sm font-bold text-foreground">{r.total_cost} kr</p>
                          <p className="text-[10px] text-muted-foreground">{r.cost_per_person} kr/pers</p>
                        </div>
                      </div>
                      {/* Participants row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Users size={11} className="text-muted-foreground" />
                        <div className="flex -space-x-1.5">
                          {r.participants.slice(0, 8).map((p) => {
                            const prof = profiles[p.user_id];
                            return (
                              <Avatar key={p.user_id} className="h-5 w-5 border-[1.5px] border-background">
                                {prof?.avatar_url ? <AvatarImage src={prof.avatar_url} /> : null}
                                <AvatarFallback className="text-[7px]">{(prof?.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                            );
                          })}
                          {r.participants.length > 8 && (
                            <span className="text-[10px] text-muted-foreground ml-1">+{r.participants.length - 8}</span>
                          )}
                        </div>
                        {r.note && <span className="text-[11px] text-muted-foreground italic ml-auto truncate max-w-[120px]">"{r.note}"</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <AddRoundSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={addRound} />
    </div>
  );
};

export default RoundsScreen;
