/**
 * RoundsScreen – Pure history feed with tap-to-expand details
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useRounds } from "@/hooks/useRounds";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Beer, Wine, Zap, Plus, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AddRoundSheet } from "@/components/rounds/AddRoundSheet";
import type { Round } from "@/hooks/useRounds";

const DRINK_ICONS: Record<string, React.ElementType> = { beer: Beer, drink: Wine, shots: Zap };
const DRINK_LABELS: Record<string, string> = { beer: "Øl", drink: "Drinker", shots: "Shots" };

export const RoundsScreen: React.FC = () => {
  const { rounds, profiles, loading, addRound } = useRounds();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [detailRound, setDetailRound] = React.useState<Round | null>(null);

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
          <div className="space-y-2">
            {rounds.map((r) => {
              const buyer = profiles[r.buyer_id];
              const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
              const DrinkIcon = DRINK_ICONS[r.drink_type] || Beer;
              const drinkLabel = DRINK_LABELS[r.drink_type] || r.drink_type;

              return (
                <button
                  key={r.id}
                  onClick={() => setDetailRound(r)}
                  className="w-full text-left p-3 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5 active:scale-[0.98] transition-all"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <DrinkIcon size={17} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm font-semibold text-foreground truncate">
                      {buyerName} – {drinkLabel.toLowerCase()}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Users size={10} className="text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{r.participants.length} pers</span>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(r.created_at), "d. MMM, HH:mm", { locale: nb })}
                      </span>
                    </div>
                  </div>
                  <p className="font-heading text-sm font-bold text-foreground shrink-0">{r.total_cost} kr</p>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <RoundDetailSheet round={detailRound} profiles={profiles} onClose={() => setDetailRound(null)} />

      <AddRoundSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={addRound} />
    </div>
  );
};

/* ---------- Round Detail Sheet ---------- */
const RoundDetailSheet: React.FC<{
  round: Round | null;
  profiles: Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }>;
  onClose: () => void;
}> = ({ round, profiles, onClose }) => {
  if (!round) return null;

  const buyer = profiles[round.buyer_id];
  const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
  const DrinkIcon = DRINK_ICONS[round.drink_type] || Beer;
  const drinkLabel = DRINK_LABELS[round.drink_type] || round.drink_type;

  return (
    <Sheet open={!!round} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <SheetHeader>
          <SheetTitle className="font-heading flex items-center gap-2">
            <DrinkIcon size={18} className="text-primary" />
            {drinkLabel}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Spandert av</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Avatar className="h-6 w-6">
                  {buyer?.avatar_url ? <AvatarImage src={buyer.avatar_url} /> : null}
                  <AvatarFallback className="text-[8px]">{(buyer?.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <p className="font-heading text-sm font-semibold text-foreground truncate">{buyerName}</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tidspunkt</p>
              <p className="font-heading text-sm font-semibold text-foreground mt-1.5">
                {format(new Date(round.created_at), "d. MMM yyyy", { locale: nb })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(round.created_at), "HH:mm", { locale: nb })}
              </p>
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex justify-between items-center">
              <p className="text-sm text-foreground">Totalt</p>
              <p className="font-heading text-lg font-bold text-foreground">{round.total_cost} kr</p>
            </div>
            <div className="flex justify-between items-center mt-1">
              <p className="text-sm text-muted-foreground">Per person ({round.participants.length} stk)</p>
              <p className="font-heading text-sm font-semibold text-foreground">{round.cost_per_person} kr</p>
            </div>
          </div>

          {/* Note */}
          {round.note && (
            <div className="p-3 rounded-xl bg-muted/20 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notat</p>
              <p className="text-sm text-foreground">{round.note}</p>
            </div>
          )}

          {/* Participants list */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Deltakere</p>
            <div className="space-y-1">
              {round.participants.map((p) => {
                const prof = profiles[p.user_id];
                const name = prof?.nickname || prof?.full_name || "Ukjent";
                const initials = (prof?.full_name || "?").slice(0, 2).toUpperCase();
                const isBuyer = p.user_id === round.buyer_id;
                return (
                  <div key={p.user_id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/10">
                    <Avatar className="h-8 w-8">
                      {prof?.avatar_url ? <AvatarImage src={prof.avatar_url} /> : null}
                      <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground flex-1 truncate">{name}</span>
                    {isBuyer && (
                      <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Spanderte</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RoundsScreen;
