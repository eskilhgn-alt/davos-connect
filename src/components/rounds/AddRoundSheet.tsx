/**
 * AddRoundSheet – Bottom sheet to register a new round
 * Now with quantity selectors per drink type instead of single type toggle
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DavosInput } from "@/components/ui/davos-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Beer, Wine, Zap, Loader2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Profile {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
}

const DRINK_TYPES = [
  { key: "beer", label: "Øl", icon: Beer },
  { key: "drink", label: "Drinker", icon: Wine },
  { key: "shots", label: "Shots", icon: Zap },
] as const;

export type DrinkQuantities = Record<string, number>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    buyerId: string,
    drinkType: string,
    totalCost: number,
    costPerPerson: number,
    participantIds: string[],
    note?: string,
    drinkQuantities?: DrinkQuantities
  ) => Promise<{ error: any }>;
}

export const AddRoundSheet: React.FC<Props> = ({ open, onOpenChange, onSubmit }) => {
  const { user } = useAuth();
  const [allProfiles, setAllProfiles] = React.useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());
  const [quantities, setQuantities] = React.useState<DrinkQuantities>({ beer: 0, drink: 0, shots: 0 });
  const [totalCost, setTotalCost] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    supabase.from("profiles").select("id, full_name, nickname, avatar_url").eq("is_active", true).then(({ data }) => {
      if (data) setAllProfiles(data);
    });
    setSelectedUsers(new Set());
    setQuantities({ beer: 0, drink: 0, shots: 0 });
    setTotalCost("");
    setNote("");
  }, [open]);

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedUsers(selectedUsers.size === allProfiles.length ? new Set() : new Set(allProfiles.map((p) => p.id)));
  };

  const adjustQty = (key: string, delta: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  const totalDrinks = Object.values(quantities).reduce((a, b) => a + b, 0);
  const total = parseFloat(totalCost) || 0;
  const perPerson = selectedUsers.size > 0 ? Math.ceil((total / selectedUsers.size) * 100) / 100 : 0;

  // Build a summary label like "mixed" or the single type
  const activeDrinkType = (): string => {
    const active = Object.entries(quantities).filter(([, v]) => v > 0);
    if (active.length === 0) return "beer";
    if (active.length === 1) return active[0][0];
    return "mixed";
  };

  const handleSubmit = async () => {
    if (!user || selectedUsers.size === 0 || total <= 0 || totalDrinks === 0) {
      toast.error("Velg deltakere, antall drikke og kostnad");
      return;
    }
    setSubmitting(true);
    const { error } = await onSubmit(
      user.id,
      activeDrinkType(),
      total,
      perPerson,
      Array.from(selectedUsers),
      note || undefined,
      quantities
    );
    setSubmitting(false);
    if (error) {
      toast.error("Kunne ikke registrere runde");
    } else {
      toast.success("Runde registrert! 🍻");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <SheetHeader>
          <SheetTitle className="font-heading">Legg til runde</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Drink quantities */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Hva ble bestilt?</p>
            <div className="space-y-2">
              {DRINK_TYPES.map((dt) => {
                const qty = quantities[dt.key] || 0;
                return (
                  <div key={dt.key} className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl border transition-all",
                    qty > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"
                  )}>
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      qty > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      <dt.icon size={16} />
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1">{dt.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => adjustQty(dt.key, -1)}
                        disabled={qty === 0}
                        className="h-8 w-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 active:scale-95"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-heading text-sm font-bold w-6 text-center text-foreground">{qty}</span>
                      <button
                        onClick={() => adjustQty(dt.key, 1)}
                        className="h-8 w-8 rounded-full border border-primary bg-primary/10 text-primary flex items-center justify-center active:scale-95"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {totalDrinks > 0 && (
              <p className="text-xs text-muted-foreground px-1">{totalDrinks} drikke totalt</p>
            )}
          </div>

          {/* Cost */}
          <div className="flex gap-3">
            <div className="flex-1">
              <DavosInput label="Totalkostnad (kr)" type="number" inputMode="decimal" placeholder="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end">
              <div className="h-11 px-3 flex items-center rounded-lg bg-muted/50 border border-border">
                <span className="text-sm font-heading font-bold text-foreground whitespace-nowrap">{perPerson} kr/pers</span>
              </div>
            </div>
          </div>

          {/* Note */}
          <DavosInput label="Notat (valgfritt)" placeholder="f.eks. Après-ski" value={note} onChange={(e) => setNote(e.target.value)} />

          {/* User selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Hvem fikk?</p>
              <button onClick={selectAll} className="text-xs text-primary font-medium tap-target" style={{ WebkitTapHighlightColor: "transparent" }}>
                {selectedUsers.size === allProfiles.length ? "Fjern alle" : "Velg alle"}
              </button>
            </div>
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto rounded-xl border border-border bg-muted/10 p-1.5" style={{ WebkitOverflowScrolling: "touch" }}>
              {allProfiles.map((p) => {
                const checked = selectedUsers.has(p.id);
                const name = p.nickname || p.full_name || "Ukjent";
                const initials = (p.full_name || "?").slice(0, 2).toUpperCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleUser(p.id)}
                    className={cn("w-full flex items-center gap-3 p-2 rounded-lg transition-colors", checked ? "bg-primary/10" : "")}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <Avatar className="h-7 w-7">
                      {p.avatar_url ? <AvatarImage src={p.avatar_url} /> : null}
                      <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground truncate">{name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{selectedUsers.size} valgt</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedUsers.size === 0 || total <= 0 || totalDrinks === 0}
            className={cn(
              "w-full h-12 rounded-xl font-heading font-semibold text-sm transition-all",
              "bg-primary text-primary-foreground",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "active:scale-[0.98]"
            )}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Registrer runde 🍻"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
