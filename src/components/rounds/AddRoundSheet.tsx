/**
 * AddRoundSheet – Bottom sheet to register a new round
 * Receives addRound as prop to avoid double hook instantiation
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DavosInput } from "@/components/ui/davos-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Beer, Wine, Zap, Loader2 } from "lucide-react";
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

const DRINK_OPTIONS = [
  { value: "beer", label: "Øl", icon: Beer },
  { value: "drink", label: "Drinker", icon: Wine },
  { value: "shots", label: "Shots", icon: Zap },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    buyerId: string,
    drinkType: string,
    totalCost: number,
    costPerPerson: number,
    participantIds: string[],
    note?: string
  ) => Promise<{ error: any }>;
}

export const AddRoundSheet: React.FC<Props> = ({ open, onOpenChange, onSubmit }) => {
  const { user } = useAuth();
  const [allProfiles, setAllProfiles] = React.useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());
  const [drinkType, setDrinkType] = React.useState("beer");
  const [totalCost, setTotalCost] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    supabase.from("profiles").select("id, full_name, nickname, avatar_url").eq("is_active", true).then(({ data }) => {
      if (data) setAllProfiles(data);
    });
    setSelectedUsers(new Set());
    setDrinkType("beer");
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

  const total = parseFloat(totalCost) || 0;
  const perPerson = selectedUsers.size > 0 ? Math.ceil((total / selectedUsers.size) * 100) / 100 : 0;

  const handleSubmit = async () => {
    if (!user || selectedUsers.size === 0 || total <= 0) {
      toast.error("Velg deltakere og legg inn kostnad");
      return;
    }
    setSubmitting(true);
    const { error } = await onSubmit(user.id, drinkType, total, perPerson, Array.from(selectedUsers), note || undefined);
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
          {/* Drink type */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Type</p>
            <div className="flex gap-2">
              {DRINK_OPTIONS.map((opt) => {
                const active = drinkType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDrinkType(opt.value)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                      "-webkit-tap-highlight-color: transparent",
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"
                    )}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    <opt.icon size={20} />
                    <span className="text-xs font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
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
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-lg transition-colors",
                      checked ? "bg-primary/10" : ""
                    )}
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
            disabled={submitting || selectedUsers.size === 0 || total <= 0}
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
