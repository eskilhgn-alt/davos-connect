/**
 * CurrencyCalculator – Popup overlay for CHF/NOK conversion
 */
import * as React from "react";
import { X, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CurrencyCalculatorProps {
  rate: number;
  rateDate?: string | null;
  rateFetchedAt?: Date | null;
  open: boolean;
  onClose: () => void;
}

export const CurrencyCalculator: React.FC<CurrencyCalculatorProps> = ({ rate, rateDate, rateFetchedAt, open, onClose }) => {
  const [amount, setAmount] = React.useState("1");
  const [direction, setDirection] = React.useState<"chf-to-nok" | "nok-to-chf">("chf-to-nok");

  if (!open) return null;

  const numAmount = parseFloat(amount) || 0;
  const converted =
    direction === "chf-to-nok"
      ? (numAmount * rate).toFixed(2)
      : (numAmount / rate).toFixed(2);

  const fromCurrency = direction === "chf-to-nok" ? "CHF" : "NOK";
  const toCurrency = direction === "chf-to-nok" ? "NOK" : "CHF";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-sm mx-4 mb-8 sm:mb-0 bg-background rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-heading text-lg font-semibold text-foreground">Valutakalkulator</h2>
          <button onClick={onClose} className="tap-target flex items-center justify-center text-muted-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* From */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">{fromCurrency}</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 rounded-xl border border-input bg-muted/50 px-4 py-3 text-[18px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Swap */}
          <div className="flex justify-center">
            <button
              onClick={() => setDirection((d) => (d === "chf-to-nok" ? "nok-to-chf" : "chf-to-nok"))}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowUpDown size={18} className="text-muted-foreground" />
            </button>
          </div>

          {/* To */}
          <div>
            <label className="text-xs text-muted-foreground font-medium">{toCurrency}</label>
            <div className="w-full mt-1 rounded-xl border border-input bg-muted/30 px-4 py-3 text-[18px] font-semibold text-foreground">
              {converted}
            </div>
          </div>

          {/* Rate info */}
          <p className="text-[10px] text-muted-foreground/50 text-center">
            1 CHF = {rate.toFixed(4)} NOK · Den europeiske sentralbanken
            {rateDate && (
              <>
                <br />
                Kurs fra: {new Date(rateDate + "T00:00:00").toLocaleDateString("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
              </>
            )}
            {rateFetchedAt && (
              <>
                <br />
                Hentet: {rateFetchedAt.toLocaleString("nb-NO", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
