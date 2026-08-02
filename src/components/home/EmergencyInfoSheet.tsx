/**
 * EmergencyInfoSheet — Nødinfo for VALGT tur (TripContext), løst via
 * `resolveDestination`. Ingen global standardtur og ingen hardkodet
 * destinasjon: mangler config, vises en ærlig tomtilstand.
 */
import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { Phone, AlertTriangle } from "lucide-react";
import { useTrip } from "@/contexts/TripContext";
import { resolveDestination } from "@/features/destination/resolveDestination";

interface EmergencyInfoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EmergencyInfoSheet: React.FC<EmergencyInfoSheetProps> = ({ open, onOpenChange }) => {
  const { selectedTrip } = useTrip();
  const trip = resolveDestination(selectedTrip);
  const primary = trip.emergency.find((g) => g.accent) ?? trip.emergency[0];
  const primaryNumber = primary?.contacts[0]?.value ?? "112";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading text-base flex items-center gap-2">
            <AlertTriangle size={18} className="text-destructive" />
            Nødinfo{trip.destination ? ` – ${trip.destination}` : ""}
            {trip.country ? `, ${trip.country}` : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 pb-6">
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-3">
            <Phone size={16} className="text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                Ved nødsituasjon – ring {primaryNumber}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Numrene under gjelder{trip.country ? ` i ${trip.country}` : ""}. Ring 112 fra hvilken som helst mobil i Europa.
              </p>
            </div>
          </div>

          {trip.emergency.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nødkontakter er ikke konfigurert for denne turen ennå.
            </p>
          )}

          {trip.emergency.map((group) => (
            <BrandCard key={group.id}>
              <BrandCardContent className="p-3 space-y-2">
                <h3 className="font-heading text-sm font-semibold text-foreground">{group.title}</h3>
                <ul className="space-y-1.5">
                  {group.contacts.map((c, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      {c.href ? (
                        <a
                          href={c.href}
                          target={c.href.startsWith("http") ? "_blank" : undefined}
                          rel="noreferrer"
                          className="font-mono text-foreground underline decoration-dotted underline-offset-2"
                        >
                          {c.value}
                        </a>
                      ) : (
                        <span className="font-mono text-foreground">{c.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </BrandCardContent>
            </BrandCard>
          ))}

          {trip.officialLinks.safety && (
            <a
              href={trip.officialLinks.safety.url}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-muted-foreground underline underline-offset-2 pt-1"
            >
              {trip.officialLinks.safety.title} ↗
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
