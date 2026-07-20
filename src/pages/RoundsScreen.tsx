/**
 * RoundsScreen – Pure history feed with tap-to-expand details + edit
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useRounds } from "@/hooks/useRounds";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { markPageSeen } from "@/hooks/useAppBadges";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BrandInput } from "@/components/ui/brand-input";
import { Beer, Wine, Plus, ChevronRight, Gift, Pencil, Check, X, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { AddRoundSheet } from "@/components/rounds/AddRoundSheet";
import { DebtCalculator } from "@/components/rounds/DebtCalculator";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import type { Round, DrinkQuantities } from "@/hooks/useRounds";
import { useSignedUrl } from "@/components/ui/SignedMedia";

const ReceiptImage: React.FC<{ value: string }> = ({ value }) => {
  // If value looks like a full URL, the resolver parses it and re-signs.
  // Otherwise, it's a bucket-relative storage path in round-receipts.
  const isUrl = /^https?:\/\//.test(value);
  const url = useSignedUrl(isUrl ? null : 'round-receipts', isUrl ? null : value, isUrl ? value : null);
  if (!url) return <div className="w-full h-32 rounded-xl border border-border bg-muted/10 animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Kvittering" className="w-full max-h-64 object-contain rounded-xl border border-border bg-muted/10" />
    </a>
  );
};

const DRINK_META: Record<string, { icon: React.ElementType; label: string }> = {
  beer: { icon: Beer, label: "Øl" },
  drink: { icon: Wine, label: "Drinker" },
};

const drinkSummary = (q: DrinkQuantities): string => {
  const parts: string[] = [];
  if (q.beer) parts.push(`${q.beer} øl`);
  if (q.drink) parts.push(`${q.drink} drink`);
  return parts.length > 0 ? parts.join(", ") : "–";
};

export const RoundsScreen: React.FC = () => {
  React.useEffect(() => { markPageSeen("runder"); }, []);
  const { rounds, profiles, loading, addRound, updateRound } = useRounds();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [debtOpen, setDebtOpen] = React.useState(false);
  const [detailRound, setDetailRound] = React.useState<Round | null>(null);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Runder" leftAction={<BackButton />} rightAction={
        <div className="flex items-center gap-1">
          <button onClick={() => setDebtOpen(true)} className="tap-target flex items-center justify-center text-primary" aria-label="Gjeld">
            <Wallet size={20} strokeWidth={2} />
          </button>
          <button onClick={() => setSheetOpen(true)} className="tap-target flex items-center justify-center text-primary" aria-label="Legg til runde">
            <Plus size={22} strokeWidth={2} />
          </button>
        </div>
      } />

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-10" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <BrandSkeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : rounds.length === 0 ? (
          <BrandEmptyState icon={Beer} title="Ingen runder ennå" description="Trykk + for å registrere den første runden" />
        ) : (
          <div className="space-y-2">
            {rounds.map((r) => {
              const buyer = profiles[r.buyer_id];
              const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
              const summary = drinkSummary(r.drink_quantities || {});

              return (
                <button
                  key={r.id}
                  onClick={() => setDetailRound(r)}
                  className="w-full text-left p-3 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5 active:scale-[0.98] transition-all"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {r.is_treated ? <Gift size={17} className="text-primary" /> : <Beer size={17} className="text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-sm font-semibold text-foreground truncate">{buyerName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {summary} · {r.participants.length} pers · {r.is_treated ? "🎁 Spandert" : "Lagt ut"} · {format(new Date(r.created_at), "d. MMM, HH:mm", { locale: nb })}
                    </p>
                  </div>
                  <p className="font-heading text-sm font-bold text-foreground shrink-0">{r.total_cost} kr</p>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <RoundDetailSheet round={detailRound} profiles={profiles} onClose={() => setDetailRound(null)} onUpdate={updateRound} />
      <AddRoundSheet open={sheetOpen} onOpenChange={setSheetOpen} onSubmit={addRound} />
      <DebtCalculator open={debtOpen} onOpenChange={setDebtOpen} />
    </div>
  );
};

/* ---------- Round Detail Sheet ---------- */
const RoundDetailSheet: React.FC<{
  round: Round | null;
  profiles: Record<string, { full_name: string | null; nickname: string | null; avatar_url: string | null }>;
  onClose: () => void;
  onUpdate: (id: string, updates: any) => Promise<{ error: any }>;
}> = ({ round, profiles, onClose, onUpdate }) => {
  const { user } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const [editNote, setEditNote] = React.useState("");
  const [editCost, setEditCost] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (round) {
      setEditNote(round.note || "");
      setEditCost(String(round.total_cost));
      setEditing(false);
    }
  }, [round]);

  if (!round) return null;

  const buyer = profiles[round.buyer_id];
  const buyerName = buyer?.nickname || buyer?.full_name || "Ukjent";
  const qty = round.drink_quantities || {};
  const hasQuantities = Object.values(qty).some((v) => v > 0);
  const canEdit = user?.id === round.buyer_id;

  const handleSave = async () => {
    setSaving(true);
    const newCost = parseFloat(editCost) || round.total_cost;
    const perPerson = round.participants.length > 0 ? Math.ceil((newCost / round.participants.length) * 100) / 100 : 0;
    const { error } = await onUpdate(round.id, {
      total_cost: newCost,
      cost_per_person: perPerson,
      note: editNote || null,
    });
    setSaving(false);
    if (error) errorToast("Kunne ikke oppdatere");
    else { toast.success("Runde oppdatert"); setEditing(false); }
  };

  return (
    <Sheet open={!!round} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="font-heading">Rundedetaljer</SheetTitle>
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} className="p-2 text-primary">
                <Pencil size={16} />
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Buyer + time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-muted/30 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {round.is_treated ? "Spandert av" : "Lagt ut av"}
              </p>
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
              <p className="text-[11px] text-muted-foreground">kl. {format(new Date(round.created_at), "HH:mm", { locale: nb })}</p>
            </div>
          </div>

          {/* Drink quantities */}
          {hasQuantities && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">Bestilling</p>
              <div className="flex gap-2">
                {Object.entries(qty).filter(([, v]) => v > 0).map(([key, val]) => {
                  const meta = DRINK_META[key];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-muted/20 flex-1">
                      <Icon size={16} className="text-primary shrink-0" />
                      <div>
                        <p className="font-heading text-lg font-bold text-foreground leading-none">{val}</p>
                        <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spandert/Lagt ut badge */}
          <div className={cn(
            "flex items-center gap-2.5 p-3 rounded-xl border",
            round.is_treated ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-border"
          )}>
            <Gift size={16} className={round.is_treated ? "text-primary" : "text-muted-foreground"} />
            <p className="text-sm font-medium text-foreground">
              {round.is_treated ? "🎁 Spandert – ingen spleis" : "Lagt ut – deles på alle"}
            </p>
          </div>

          {/* Cost breakdown */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            {editing ? (
              <div className="space-y-2">
                <BrandInput label="Totalkostnad (kr)" type="number" inputMode="decimal" value={editCost} onChange={e => setEditCost(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-foreground">Totalt</p>
                  <p className="font-heading text-lg font-bold text-foreground">{round.total_cost} kr</p>
                </div>
                {!round.is_treated && (
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-sm text-muted-foreground">Per person ({round.participants.length} stk)</p>
                    <p className="font-heading text-sm font-semibold text-foreground">{round.cost_per_person} kr</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Note */}
          <div className="p-3 rounded-xl bg-muted/20 border border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notat</p>
            {editing ? (
              <BrandInput value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Legg til notat..." />
            ) : (
              <p className="text-sm text-foreground">{round.note || "–"}</p>
            )}
          </div>

          {/* Edit actions */}
          {editing && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 h-10 rounded-xl border border-border flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
                <X size={14} /> Avbryt
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-1.5 text-sm font-semibold disabled:opacity-50">
                <Check size={14} /> Lagre
              </button>
            </div>
          )}

          {/* Receipt — resolve via signed URL (works for legacy full URLs and new storage paths). */}
          {round.receipt_image_url && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">Kvittering</p>
              <ReceiptImage value={round.receipt_image_url} />
            </div>
          )}

          {/* Participants */}
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
                      <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {round.is_treated ? "Spanderte" : "La ut"}
                      </span>
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
