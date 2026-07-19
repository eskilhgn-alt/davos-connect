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
import { ArrowRight, Check, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

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

  React.useEffect(() => {
    if (!open) return;
    loadDebts();
  }, [open]);

  const loadDebts = async () => {
    setLoading(true);
    
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

    // Build profile map
    const profMap = new Map<string, Profile>();
    profs.forEach((p: any) => profMap.set(p.id, p));
    setProfiles(profMap);

    // Build participant map
    const partMap = new Map<string, string[]>();
    parts.forEach((p: any) => {
      const arr = partMap.get(p.round_id) || [];
      arr.push(p.user_id);
      partMap.set(p.round_id, arr);
    });

    // Calculate raw debts: each participant owes buyer their share
    const balances = new Map<string, number>(); // "from:to" => amount
    
    rounds.forEach((r: any) => {
      const participants = partMap.get(r.id) || [];
      if (participants.length === 0) return;
      const perPerson = Number(r.total_cost) / participants.length;
      
      participants.forEach((pId: string) => {
        if (pId === r.buyer_id) return; // buyer doesn't owe themselves
        const key = `${pId}:${r.buyer_id}`;
        const reverseKey = `${r.buyer_id}:${pId}`;
        balances.set(key, (balances.get(key) || 0) + perPerson);
      });
    });

    // Apply settlements
    settlements.forEach((s: any) => {
      const key = `${s.from_user_id}:${s.to_user_id}`;
      balances.set(key, (balances.get(key) || 0) - Number(s.amount));
    });

    // Net out bidirectional debts
    const netDebts: DebtEdge[] = [];
    const processed = new Set<string>();

    balances.forEach((amount, key) => {
      if (processed.has(key)) return;
      const [from, to] = key.split(":");
      const reverseKey = `${to}:${from}`;
      processed.add(key);
      processed.add(reverseKey);

      const reverseAmount = balances.get(reverseKey) || 0;
      const net = amount - reverseAmount;

      if (Math.abs(net) > 1) { // ignore < 1 kr
        if (net > 0) {
          netDebts.push({ from, to, amount: Math.round(net) });
        } else {
          netDebts.push({ from: to, to: from, amount: Math.round(Math.abs(net)) });
        }
      }
    });

    netDebts.sort((a, b) => b.amount - a.amount);
    setDebts(netDebts);
    setLoading(false);
  };

  const handleSettle = async (debt: DebtEdge) => {
    if (!user) return;
    const { error } = await supabase.from("debt_settlements").insert({
      from_user_id: debt.from,
      to_user_id: debt.to,
      amount: debt.amount,
      created_by: user.id,
      note: "Markert som betalt",
    });
    if (error) {
      toast.error("Kunne ikke markere som betalt");
      return;
    }
    toast.success("Markert som betalt! ✅");
    loadDebts();
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
                    <DebtRow key={i} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle />
                  ))}
                </div>
              )}

              {/* Owed to me */}
              {owedToMe.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Skylder deg</p>
                  {owedToMe.map((d, i) => (
                    <DebtRow key={i} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle />
                  ))}
                </div>
              )}

              {/* Other debts */}
              {otherDebts.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Andre</p>
                  {otherDebts.map((d, i) => (
                    <DebtRow key={i} debt={d} getName={getName} getAvatar={getAvatar} getInitials={getInitials} onSettle={handleSettle} canSettle={false} />
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
}> = ({ debt, getName, getAvatar, getInitials, onSettle, canSettle }) => (
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
    <span className="font-heading text-sm font-bold text-foreground shrink-0">{debt.amount} kr</span>
    {canSettle && (
      <button
        onClick={() => onSettle(debt)}
        className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all shrink-0"
        title="Marker som betalt"
      >
        <Check size={14} />
      </button>
    )}
  </div>
);
