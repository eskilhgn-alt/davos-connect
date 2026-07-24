/**
 * TripSwitcher — kompakt selector for aktiv/valgt tur.
 *
 * Vises bare når brukeren er medlem av mer enn én tur. Skjuler seg helt
 * ved én tur, så vanlige brukere ikke ser unødvendig UI.
 */
import * as React from "react";
import { useTrip } from "@/contexts/TripContext";
import { Archive, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export const TripSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { trips, selectedTrip, selectedTripId, selectTrip, isArchive, isLoading } = useTrip();

  if (isLoading || trips.length <= 1) return null;

  return (
    <label className={cn("block", className)}>
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
        {isArchive ? <Archive size={11} /> : <MapPin size={11} />}
        <span>{isArchive ? "Arkivert tur" : "Aktiv tur"}</span>
      </span>
      <select
        aria-label="Velg tur"
        value={selectedTripId ?? ""}
        onChange={(e) => {
          void selectTrip(e.target.value);
        }}
        className={cn(
          "w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
        )}
      >
        {trips
          .slice()
          .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.status === "active" ? " · aktiv" : " · arkiv"}
            </option>
          ))}
      </select>
      {selectedTrip && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selectedTrip.destination}
          {selectedTrip.country ? `, ${selectedTrip.country}` : ""}
        </p>
      )}
    </label>
  );
};
