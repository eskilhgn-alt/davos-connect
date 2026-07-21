/**
 * DebtCalculator — Venmo-style: who owes whom based on rounds
 * Only counts non-treated rounds (is_treated = false)
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRight, Check, Wallet, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { calculateDebts, type DebtEdge } from "@/features/rounds/logic";

interface Profile {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export const DebtCalculator: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void }> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const [debts, setDebts] = React.useState<DebtEdge[]>([]);
  const [profiles, setProfiles] = React.useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [settlingKey, setSettlingKey] = React.useState<string | null>(null);

  const loadDebts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Fetch all non-treated rounds with participants
    const [roundsRes, partsRes, profilesRes, settlementsRes] = await Promise.all([
      supabase.from("rounds").select("*").eq("is_treated", false),
      supabase.from("round_participants").select("round_id, user_id"),
      supabase.from("profiles").select("id, nickname, full_name, avatar_url"),
      supabase.from("debt_settlements").select("*"),
    ]);

    const rounds = roundsRes.data || [];
    const parts = partsRes.data || [];
    const profs = profilesRes.data || [];
    const settlements = settlementsRes.data || [];

    const queryError = roundsRes.error || partsRes.error || profilesRes.error || settlementsRes.error;
    if (queryError) {
      console.error("[debts] load failed", queryError);
      setError(queryError.message || "Kunne ikke laste oppgjør");
      setLoading(false);
      return;
    }

    // Build profile map
    const profMap = new Map<string, Profile>();
    profs.forEach((p) => profMap.set(p.id, p));
    setProfiles(profMap);

    setDebts(calculateDebts(rounds, parts, settlements));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadDebts();
  }, [open, loadDebts]);

  const handleSettle = async (debt: DebtEdge) => {
    if (!user || settlingKey) return;
    const key = `${debt.currency}:${debt.from}:${debt.to}`;
    setSettlingKey(key);
    const { error } = await supabase.from("debt_settlements").insert({
      from_user_id: debt.from,
      to_user_id: debt.to,
      amount: debt.amount,
      currency: debt.currency,
      client_id: crypto.randomUUID(),
      created_by: user.id,
      note: "Markert som betalt",
    });
    if (error) {
      toast.error("Kunne ikke markere som betalt");
      setSettlingKey(null);
      return;
    }
    toast.success("Markert som betalt! ✅");
    await loadDebts();
    setSettlingKey(null);
  };

  const getName = (id: string) => {
    const p = profiles.get(id);
    return p?.nickname || p?.full_name || "Ukjent";
  };
  const getAvatar = (id: string) => profiles.get(id)?.avatar_url;
  const getInitials = (id: string) => (getName(id)).slice(0, 2).toUpperCase();

  const myDebts = debts.filter((d) => d.from === user?.id);
  const owedToMe = debts.filter((d) => d.to === user?.id);
  const otherDebts = debts.filter((d) => d.from !== user?.id && d.to !== user?.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <SheetHeader>
          <SheetTitle className="font-heading flex items-center gap-2">
            <Wallet size={18} /> Hvem skylder hvem?
          </SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <BrandSkeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle size={28} className="text-destructive" />
              <p className="text-sm text-muted-foreground">Kunne ikke laste oppgjøret</p>
              <button type="button" onClick={() => void loadDebts()} className="min-h-11 rounded-full border border-border px-4 text-sm flex items-center gap-2">
                <RefreshCw size={16} /> Prøv igjen
              </button>
            </div>
          ) : debts.length === 0 ? (
            <div className="text-center py-8">
              <Check size={32} className="mx-auto text-primary mb-2" />
              <p className="text-sm font-medium text-foreground">Alt oppgjort! 🎉</p>
              <p className="text-xs text-muted-foreground mt-1">Ingen gjeld mellom noen</p>
            </div>
          ) : (
            <>
              {/* My debts */}
              {myDebts.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Du skylder</p>
                  {myDebts.map((d, i) => (
                    <DebtRow key={`${d.currency}-${i}`} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle settling={settlingKey === `${d.currency}:${d.from}:${d.to}`} />
                  ))}
                </div>
              )}

              {/* Owed to me */}
              {owedToMe.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Skylder deg</p>
                  {owedToMe.map((d, i) => (
                    <DebtRow key={`${d.currency}-${i}`} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle settling={settlingKey === `${d.currency}:${d.from}:${d.to}`} />
                  ))}
                </div>
              )}

              {/* Other debts */}
              {otherDebts.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Andre</p>
                  {otherDebts.map((d, i) => (
                    <DebtRow key={`${d.currency}-${i}`} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle={false} settling={false} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const DebtRow: React.FC<{
  debt: DebtEdge;
  getName: (id: string) => string;
  getAvatar: (id: string) => string | null | undefined;
  getInitials: (id: string) => string;
  onSettle: (debt: DebtEdge) => void;
  canSettle: boolean;
  settling: boolean;
}> = ({ debt, getName, getAvatar, getInitials, onSettle, canSettle, settling }) => (
  <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/20 mb-1.5">
    <Avatar className="h-8 w-8 shrink-0">
      {getAvatar(debt.from) ? <AvatarImage src={getAvatar(debt.from)!} /> : null}
      <AvatarFallback className="text-[9px]">{getInitials(debt.from)}</AvatarFallback>
    </Avatar>
    <div className="flex-1 min-w-0 flex items-center gap-1.5">
      <span className="text-sm font-medium text-foreground truncate">{getName(debt.from)}</span>
      <ArrowRight size={14} className="text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-foreground truncate">{getName(debt.to)}</span>
    </div>
    <span className="font-heading text-sm font-bold text-foreground shrink-0">{new Intl.NumberFormat("nb-NO", { style: "currency", currency: debt.currency, maximumFractionDigits: 2 }).format(debt.amount)}</span>
    {canSettle && (
      <button
        onClick={() => onSettle(debt)}
        disabled={settling}
        className="min-h-9 min-w-9 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all shrink-0 disabled:opacity-50 flex items-center justify-center"
        title="Marker som betalt"
      >
        {settling ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
    )}
  </div>
);
