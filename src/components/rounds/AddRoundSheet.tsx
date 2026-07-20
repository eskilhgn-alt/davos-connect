/**
 * AddRoundSheet – Bottom sheet to register a new round
 * Now with quantity selectors per drink type instead of single type toggle
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrandInput } from "@/components/ui/brand-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Beer, Wine, Loader2, Minus, Plus, Camera, ImageIcon, X, Gift, UtensilsCrossed, ShoppingCart } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { reencodeImage } from "@/lib/imageOptimize";
import { ACTIVE_TRIP } from "@/config/trip";
import type { CreateRoundInput, CreateRoundResult } from "@/hooks/useRounds";

interface Profile {
  id: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
}

const DRINK_TYPES = [
  { key: "beer", label: "Øl", icon: Beer },
  { key: "drink", label: "Drinker", icon: Wine },
  { key: "food", label: "Mat", icon: UtensilsCrossed },
  { key: "grocery", label: "Dagligvare", icon: ShoppingCart },
] as const;

export type DrinkQuantities = Record<string, number>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateRoundInput) => Promise<CreateRoundResult>;
}

export const AddRoundSheet: React.FC<Props> = ({ open, onOpenChange, onSubmit }) => {
  const { user } = useAuth();
  const [allProfiles, setAllProfiles] = React.useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());
  const [quantities, setQuantities] = React.useState<DrinkQuantities>({ beer: 0, drink: 0 });
  const [isTreated, setIsTreated] = React.useState(false);
  const [totalCost, setTotalCost] = React.useState("");
  const [note, setNote] = React.useState("");
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitPhase, setSubmitPhase] = React.useState<"idle" | "preparing" | "uploading" | "saving">("idle");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [profilesError, setProfilesError] = React.useState<string | null>(null);
  const receiptRef = React.useRef<HTMLInputElement>(null);
  const clientIdRef = React.useRef(crypto.randomUUID());
  const uploadedReceiptPathRef = React.useRef<string | null>(null);

  const formatMoney = React.useCallback((value: number) => new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: ACTIVE_TRIP.currency,
    maximumFractionDigits: 2,
  }).format(value), []);

  React.useEffect(() => {
    if (!open) return;
    setProfilesError(null);
    supabase.from("profiles").select("id, full_name, nickname, avatar_url").eq("is_active", true).then(({ data, error }) => {
      if (error) setProfilesError("Kunne ikke laste deltakere");
      else if (data) setAllProfiles(data);
    });
    setSelectedUsers(new Set());
    setQuantities({ beer: 0, drink: 0 });
    setIsTreated(false);
    setTotalCost("");
    setNote("");
    setReceiptFile(null);
    setReceiptPreview(null);
    setSubmitPhase("idle");
    setSubmitError(null);
    clientIdRef.current = crypto.randomUUID();
    uploadedReceiptPathRef.current = null;
  }, [open]);

  React.useEffect(() => {
    if (!receiptFile) { setReceiptPreview(null); return; }
    const url = URL.createObjectURL(receiptFile);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);

  const cleanupUploadedReceipt = React.useCallback(async () => {
    const path = uploadedReceiptPathRef.current;
    if (!path) return;
    uploadedReceiptPathRef.current = null;
    const { error } = await supabase.storage.from("round-receipts").remove([path]);
    if (error) console.warn("[rounds] receipt cleanup failed", path, error);
  }, []);

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { errorToast("Kun bilder er tillatt"); return; }
    if (file.size > 10 * 1024 * 1024) { errorToast("Maks 10 MB"); return; }
    void cleanupUploadedReceipt();
    setReceiptFile(file);
    setSubmitError(null);
    e.target.value = "";
  };

  const clearReceipt = () => {
    setReceiptFile(null);
    void cleanupUploadedReceipt();
    if (receiptRef.current) receiptRef.current.value = "";
  };

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
      errorToast("Velg deltakere, antall drikke og kostnad");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      let receiptPath = uploadedReceiptPathRef.current || undefined;
      if (receiptFile && !receiptPath) {
        setSubmitPhase("preparing");
        const processed = await reencodeImage(receiptFile, { maxDim: 1800, quality: 0.86, mimeType: "image/jpeg" });
        if (processed.type !== "image/jpeg" || processed.size === 0 || processed.size > 10 * 1024 * 1024) {
          throw new Error("Kvitteringen kunne ikke behandles trygt");
        }
        const attemptId = crypto.randomUUID();
        receiptPath = `${user.id}/${attemptId}/receipt.jpg`;
        setSubmitPhase("uploading");
        const { error: uploadError } = await supabase.storage.from("round-receipts").upload(receiptPath, processed, {
          contentType: "image/jpeg",
        });
        if (uploadError) throw new Error(`Kvitteringen kunne ikke lastes opp: ${uploadError.message}`);
        uploadedReceiptPathRef.current = receiptPath;
      }

      setSubmitPhase("saving");
      const result = await onSubmit({
        clientId: clientIdRef.current,
        drinkType: activeDrinkType(),
        totalCost: total,
        participantIds: Array.from(selectedUsers),
        note: note || undefined,
        drinkQuantities: quantities,
        receiptPath,
        isTreated,
        currency: ACTIVE_TRIP.currency,
      });
      if (result.error) {
        if (result.canCleanupReceipt) await cleanupUploadedReceipt();
        throw new Error(result.error.message || "Kunne ikke registrere runden");
      }

      uploadedReceiptPathRef.current = null;
      toast.success("Runde registrert! 🍻");
      onOpenChange(false);
    } catch (e: unknown) {
      console.error("Round submit exception:", e);
      const message = e instanceof Error ? e.message : "Ukjent feil";
      setSubmitError(message);
      errorToast("Feil ved registrering", { description: message });
    } finally {
      setSubmitting(false);
      setSubmitPhase("idle");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && submitting) return;
    if (!nextOpen) void cleanupUploadedReceipt();
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <SheetHeader>
          <SheetTitle className="font-heading">Legg til runde</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Drink quantities */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Hva ble kjøpt?</p>
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
              <p className="text-xs text-muted-foreground px-1">{totalDrinks} enheter totalt</p>
            )}
          </div>

          {/* Spandert toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <Gift size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Spandert</p>
                <p className="text-[11px] text-muted-foreground">{isTreated ? "Runden er spandert 🎁" : "Lagt ut – deles på alle"}</p>
              </div>
            </div>
            <Switch checked={isTreated} onCheckedChange={setIsTreated} />
          </div>

          {/* Cost */}
          <div className="flex gap-3">
            <div className="flex-1">
              <BrandInput label={`Totalkostnad (${ACTIVE_TRIP.currency})`} type="number" inputMode="decimal" placeholder="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end">
              <div className="h-11 px-3 flex items-center rounded-lg bg-muted/50 border border-border">
                <span className="text-sm font-heading font-bold text-foreground whitespace-nowrap">{formatMoney(perPerson)}/pers</span>
              </div>
            </div>
          </div>

          {/* Note */}
          <BrandInput label="Notat (valgfritt)" placeholder="f.eks. Après-ski" value={note} onChange={(e) => setNote(e.target.value)} />

          {/* Receipt photo */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Kvittering (valgfritt)</p>
            {receiptPreview ? (
              <div className="relative inline-block">
                <img src={receiptPreview} alt="Kvittering" className="h-24 w-auto rounded-xl border border-border object-cover" />
                <button
                  onClick={clearReceipt}
                  className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (receiptRef.current) {
                      receiptRef.current.setAttribute("capture", "environment");
                      receiptRef.current.click();
                    }
                  }}
                  className="flex-1 h-11 rounded-xl border border-border bg-muted/20 flex items-center justify-center gap-2 text-sm font-medium text-foreground active:scale-[0.98]"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <Camera size={16} className="text-muted-foreground" />
                  Ta bilde
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (receiptRef.current) {
                      receiptRef.current.removeAttribute("capture");
                      receiptRef.current.click();
                    }
                  }}
                  className="flex-1 h-11 rounded-xl border border-border bg-muted/20 flex items-center justify-center gap-2 text-sm font-medium text-foreground active:scale-[0.98]"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <ImageIcon size={16} className="text-muted-foreground" />
                  Last opp
                </button>
              </div>
            )}
            <input
              ref={receiptRef}
              type="file"
              accept="image/*"
              onChange={handleReceiptChange}
              className="hidden"
            />
          </div>

          {/* User selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Hvem fikk?</p>
              <button onClick={selectAll} className="text-xs text-primary font-medium tap-target" style={{ WebkitTapHighlightColor: "transparent" }}>
                {selectedUsers.size === allProfiles.length ? "Fjern alle" : "Velg alle"}
              </button>
            </div>
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto rounded-xl border border-border bg-muted/10 p-1.5" style={{ WebkitOverflowScrolling: "touch" }}>
              {profilesError && <p role="alert" className="p-3 text-sm text-destructive">{profilesError}</p>}
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
          {submitError && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {submitError}. Opplysningene dine er bevart – prøv igjen.
            </div>
          )}
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
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {submitPhase === "preparing" ? "Behandler kvittering…" : submitPhase === "uploading" ? "Laster opp…" : "Lagrer…"}
              </span>
            ) : "Registrer runde 🍻"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
