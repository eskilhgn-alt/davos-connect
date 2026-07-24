/**
 * AdminTrips — «Opprett, velg, arkiver og administrer flere turer.»
 * ---------------------------------------------------------------------------
 * Enkel admin-flate for turadministrasjon. Bruker RPC-er som ligger bak
 * has_role/is_admin, så vanlige brukere kan ikke kalle disse selv om UI-et
 * skulle bli eksponert ved uhell.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Archive, CheckCircle2, Pencil } from "lucide-react";
import { useActiveTrip, type Trip } from "@/hooks/useActiveTrip";

export const AdminTrips: React.FC = () => {
  const { trips, activeTripId, isLoading, refetch } = useActiveTrip();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Trip | null>(null);

  const runRpc = React.useCallback(
    async (label: string, fn: () => Promise<{ error: unknown }>) => {
      try {
        const { error } = await fn();
        if (error) throw error;
        await refetch();
        toast.success(label);
      } catch (e) {
        toast.error((e as Error).message || `Kunne ikke ${label.toLowerCase()}`);
      }
    },
    [refetch],
  );

  const activate = (id: string) => {
    setBusyId(id);
    void runRpc("Aktivert", async () =>
      (await (supabase as any).rpc("rpc_admin_set_active_trip", { p_trip_id: id })),
    ).finally(() => setBusyId(null));
  };

  const archive = (id: string) => {
    setBusyId(id);
    void runRpc("Arkivert", async () =>
      (await (supabase as any).rpc("rpc_admin_archive_trip", { p_trip_id: id })),
    ).finally(() => setBusyId(null));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Opprett, velg, arkiver og administrer flere turer.
        </p>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm min-h-[44px]"
        >
          <Plus className="h-4 w-4" /> Ny tur
        </button>
      </div>

      <ul className="space-y-2">
        {trips.map((t) => {
          const isActive = t.id === activeTripId;
          return (
            <li
              key={t.id}
              className="border border-border rounded-xl p-3 bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground flex items-center gap-2">
                    {t.name}
                    {isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Aktiv
                      </span>
                    )}
                    {t.status === "archived" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Arkivert
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t.destination}
                    {t.start_date && ` · ${t.start_date}`}
                    {t.end_date && ` – ${t.end_date}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px]"
                    aria-label="Rediger tur"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!isActive && (
                    <button
                      onClick={() => activate(t.id)}
                      disabled={busyId === t.id}
                      className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px]"
                      aria-label="Sett som aktiv"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </button>
                  )}
                  {isActive && (
                    <button
                      onClick={() => archive(t.id)}
                      disabled={busyId === t.id}
                      className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px]"
                      aria-label="Arkiver tur"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {(creating || editing) && (
        <TripFormModal
          trip={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
};

const TripFormModal: React.FC<{
  trip: Trip | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ trip, onClose, onSaved }) => {
  const [name, setName] = React.useState(trip?.name ?? "");
  const [destination, setDestination] = React.useState(trip?.destination ?? "");
  const [country, setCountry] = React.useState(trip?.country ?? "");
  const [startDate, setStartDate] = React.useState(trip?.start_date ?? "");
  const [endDate, setEndDate] = React.useState(trip?.end_date ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!name || !destination) {
      toast.error("Navn og destinasjon er obligatorisk");
      return;
    }
    setSaving(true);
    try {
      const rpc = trip ? "rpc_admin_update_trip" : "rpc_admin_create_trip";
      const params: Record<string, unknown> = {
        p_name: name,
        p_destination: destination,
        p_country: country || null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      };
      if (trip) params.p_trip_id = trip.id;
      const { error } = await (supabase as any).rpc(rpc, params);
      if (error) throw error;
      toast.success(trip ? "Tur oppdatert" : "Tur opprettet");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
        <h3 className="font-semibold text-lg">{trip ? "Rediger tur" : "Ny tur"}</h3>
        <Field label="Navn" value={name} onChange={setName} />
        <Field label="Destinasjon" value={destination} onChange={setDestination} />
        <Field label="Land" value={country} onChange={setCountry} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Startdato" value={startDate} onChange={setStartDate} type="date" />
          <Field label="Sluttdato" value={endDate} onChange={setEndDate} type="date" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm min-h-[44px]"
          >
            Avbryt
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm min-h-[44px]"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = "text" }) => (
  <label className="block">
    <span className="text-xs text-muted-foreground">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px]"
    />
  </label>
);

export default AdminTrips;
