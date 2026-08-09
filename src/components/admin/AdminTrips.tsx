/**
 * AdminTrips — «Opprett, velg, arkiver og administrer flere turer.»
 * ---------------------------------------------------------------------------
 * Enkel admin-flate for turadministrasjon. Bruker RPC-er som ligger bak
 * has_role/is_admin, så vanlige brukere kan ikke kalle disse selv om UI-et
 * skulle bli eksponert ved uhell.
 *
 * Lagringskontrakt (viktig):
 *  - `destination_config` sendes ALLTID som full, merge-bevart blokk. Vi rører
 *    aldri weather/map/webcam-felter.
 *  - Suksess vises først etter at RPC-ens returnerte rad (eller en eksplisitt
 *    kontroll-lesing) bekrefter at datoer og discovery faktisk ble persistert.
 *  - Etter lagring invalideres ["trips","list"] og TripContext lastes på nytt,
 *    slik at UI aldri viser en gammel rad i opptil 60 sekunder.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Archive, CheckCircle2, Pencil, Wand2 } from "lucide-react";
import type { Trip } from "@/hooks/useActiveTrip";
import { useTrip } from "@/contexts/TripContext";
import { normalizeRpcTripRow } from "@/features/trip/tripSync";
import { CATEGORY_LABELS, DISCOVER_CATEGORIES, type DiscoverCategory } from "@/features/discover/types";
import {
  discoveryDraftFromConfig,
  mergeDiscoveryIntoConfig,
  resolveDiscoveryConfig,
  validateDiscoveryDraft,
  valThorensDiscoveryPreset,
  SUPPORTED_PROVIDERS,
  type DiscoveryDraft,
} from "@/features/discover/discoveryConfig";
import {
  destinationDraftFromTrip,
  mergeDestinationIntoConfig,
  parseDestinationDraft,
  valThorensDestinationPreset,
  valThorensRuntimePatch,
  type DestinationDraft,
} from "@/features/destination/destinationDraft";

export const AdminTrips: React.FC<{ initialTripId?: string | null }> = ({ initialTripId }) => {
  const { trips, activeTrip, isLoading, reloadTrips, applySavedTrip } = useTrip();
  const activeTripId = activeTrip?.id ?? null;
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Trip | null>(null);
  const openedDeepLink = React.useRef(false);

  React.useEffect(() => {
    if (openedDeepLink.current || !initialTripId || trips.length === 0) return;
    const t = trips.find((x) => x.id === initialTripId);
    if (t) {
      openedDeepLink.current = true;
      setEditing(t);
    }
  }, [initialTripId, trips]);

  /**
   * Kjører en admin-RPC og synker den returnerte, autoritative raden inn i
   * den kanoniske turtilstanden (TripContext + ["trips","list"]). Faller
   * tilbake til en full, race-sikker relesing hvis RPC-en ikke gir rad.
   */
  const runRpc = React.useCallback(
    async (label: string, fn: () => Promise<{ data: unknown; error: unknown }>) => {
      try {
        const { data, error } = await fn();
        if (error) throw error;
        const row = normalizeRpcTripRow(data);
        if (row) await applySavedTrip(row);
        else await reloadTrips();
        toast.success(label);
      } catch (e) {
        toast.error((e as Error).message || `Kunne ikke ${label.toLowerCase()}`);
      }
    },
    [applySavedTrip, reloadTrips],
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
          const discovery = resolveDiscoveryConfig(t.destination_config);
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
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Oppdag:{" "}
                    {discovery.configured ? (
                      <span className="text-foreground">
                        konfigurert ({discovery.providers.join(", ")}, {discovery.radiusM} m)
                      </span>
                    ) : (
                      "ikke konfigurert"
                    )}
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
          }}
        />
      )}
    </div>
  );
};

/** Sammenlikner det vi sendte med det som faktisk ble persistert. */
export function verifySavedTrip(
  row: {
    start_date?: unknown;
    end_date?: unknown;
    timezone?: unknown;
    currency?: unknown;
    destination_config?: unknown;
  } | null,
  expected: {
    startDate: string | null;
    endDate: string | null;
    discoveryVersion: string | null;
    timezone?: string | null;
    currency?: string | null;
    center?: { lat: number; lon: number } | null;
    zoom?: number | null;
  },
): string | null {
  if (!row) return "Fikk ingen bekreftelse fra serveren";
  const norm = (v: unknown) => (v == null || v === "" ? null : String(v).slice(0, 10));
  if (norm(row.start_date) !== expected.startDate) return "Startdato ble ikke lagret";
  if (norm(row.end_date) !== expected.endDate) return "Sluttdato ble ikke lagret";
  if (expected.timezone && row.timezone !== expected.timezone) return "Tidssone ble ikke lagret";
  if (expected.currency && row.currency !== expected.currency) return "Valuta ble ikke lagret";
  const cfg = (row.destination_config ?? {}) as Record<string, unknown>;
  if (expected.center) {
    const c = (cfg.center ?? {}) as Record<string, unknown>;
    if (c.lat !== expected.center.lat || c.lon !== expected.center.lon)
      return "Senterkoordinatene ble ikke lagret";
  }
  if (expected.zoom != null && cfg.zoom !== expected.zoom) return "Kartzoom ble ikke lagret";
  const saved = resolveDiscoveryConfig(row.destination_config as Record<string, unknown>);
  const savedVersion = saved.configured ? saved.version : null;
  if (expected.discoveryVersion && savedVersion !== expected.discoveryVersion)
    return "Oppdag-konfigurasjonen ble ikke lagret";
  return null;
}

const TripFormModal: React.FC<{
  trip: Trip | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}> = ({ trip, onClose, onSaved }) => {
  const queryClient = useQueryClient();
  const { applySavedTrip, reloadTrips } = useTrip();
  const [name, setName] = React.useState(trip?.name ?? "");
  const [destination, setDestination] = React.useState(trip?.destination ?? "");
  const [country, setCountry] = React.useState(trip?.country ?? "");
  const [startDate, setStartDate] = React.useState(trip?.start_date ?? "");
  const [endDate, setEndDate] = React.useState(trip?.end_date ?? "");
  const [saving, setSaving] = React.useState(false);
  const [discovery, setDiscovery] = React.useState<DiscoveryDraft>(() =>
    discoveryDraftFromConfig(trip?.destination_config),
  );
  const [dest, setDest] = React.useState<DestinationDraft>(() => destinationDraftFromTrip(trip));
  /** Preset-runtime (peaks/officialLinks) legges bare på når admin trykker preset-knappen. */
  const [applyVtRuntime, setApplyVtRuntime] = React.useState(false);

  const existingCfg = (trip?.destination_config ?? {}) as Record<string, unknown>;
  const parsedDest = React.useMemo(() => parseDestinationDraft(dest), [dest]);
  const hasCenter = parsedDest.error === null;
  const center = hasCenter ? parsedDest.value.center : undefined;
  const preset = React.useMemo(() => valThorensDiscoveryPreset(trip), [trip]);
  const destPreset = React.useMemo(() => valThorensDestinationPreset(trip), [trip]);

  const toggleCategory = (c: DiscoverCategory) =>
    setDiscovery((d) => ({
      ...d,
      categories: d.categories.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...d.categories, c],
    }));

  const toggleProvider = (p: string) =>
    setDiscovery((d) => ({
      ...d,
      providers: d.providers.includes(p) ? d.providers.filter((x) => x !== p) : [...d.providers, p],
    }));

  const discoveryTouched =
    discovery.providers.length > 0 || discovery.categories.length > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // hindrer dobbel innsending
    void save();
  };

  const save = async () => {
    if (saving) return;
    if (!name || !destination) {
      toast.error("Navn og destinasjon er obligatorisk");
      return;
    }
    const destParsed = parseDestinationDraft(dest);
    const destTouched =
      dest.timezone.trim() !== "" ||
      dest.currency.trim() !== "" ||
      dest.lat.trim() !== "" ||
      dest.lon.trim() !== "" ||
      dest.zoom.trim() !== "";
    if (destTouched && destParsed.error) {
      toast.error(destParsed.error);
      return;
    }

    let mergedConfig: Record<string, unknown> = { ...existingCfg };
    if (destTouched && destParsed.error === null) {
      mergedConfig = mergeDestinationIntoConfig(mergedConfig, destParsed.value);
      if (applyVtRuntime) {
        mergedConfig = valThorensRuntimePatch(trip, mergedConfig) ?? mergedConfig;
      }
    }
    let expectedVersion: string | null = null;
    if (discoveryTouched) {
      const invalid = validateDiscoveryDraft(discovery);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      if (!hasCenter) {
        toast.error("Turen mangler verifisert senter (breddegrad/lengdegrad)");
        return;
      }
      mergedConfig = mergeDiscoveryIntoConfig(mergedConfig, discovery);
      const resolved = resolveDiscoveryConfig(mergedConfig);
      expectedVersion = resolved.configured ? resolved.version : null;
    }

    if (!validateTripDates(startDate || null, endDate || null)) {
      toast.error("Startdato må være før eller lik sluttdato");
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
        p_destination_config: mergedConfig,
      };
      if (destTouched && destParsed.error === null) {
        params.p_timezone = destParsed.value.timezone;
        params.p_currency = destParsed.value.currency;
      }
      if (trip) params.p_trip_id = trip.id;
      const { data, error } = await (supabase as any).rpc(rpc, params);
      if (error) throw error;

      // Verifiser mot returnert rad, med eksplisitt kontroll-lesing som backup.
      let row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      const tripId = (row?.id as string | undefined) ?? trip?.id;
      if ((!row || row.destination_config === undefined || row.name === undefined) && tripId) {
        const { data: check } = await (supabase as any)
          .from("trips")
          .select("*")
          .eq("id", tripId)
          .maybeSingle();
        row = (check as Record<string, unknown> | null) ?? row;
      }
      const mismatch = verifySavedTrip(row, {
        startDate: startDate || null,
        endDate: endDate || null,
        discoveryVersion: expectedVersion,
        timezone: destTouched && destParsed.error === null ? destParsed.value.timezone : null,
        currency: destTouched && destParsed.error === null ? destParsed.value.currency : null,
        center: destTouched && destParsed.error === null ? destParsed.value.center : null,
        zoom: destTouched && destParsed.error === null ? destParsed.value.zoom : null,
      });
      if (mismatch) throw new Error(mismatch);

      // Én eksplisitt save-and-sync-sekvens: den verifiserte raden er
      // autoritativ og synkes inn i TripContext + ["trips","list"] før vi
      // viser suksess og lukker dialogen. Ingen ekstra, konkurrerende refetch.
      const savedRow = normalizeRpcTripRow(row);
      if (savedRow) {
        // Én autoritativ oppdateringssekvens: TripContext eier både
        // context-state og ["trips","list"]. Ingen dobbel setQueryData her.
        await applySavedTrip(savedRow);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["trips", "list"] });
        await reloadTrips();
      }
      toast.success(trip ? "Tur oppdatert og verifisert" : "Tur opprettet og verifisert");
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  return (
    // z-[70] ligger entydig over BottomNavigation (z-50), slik at Lagre aldri
    // males over av appnavigasjonen på mobil.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={trip ? "Rediger tur" : "Ny tur"}
      data-testid="trip-form-overlay"
      className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center"
    >
      <form
        onSubmit={onSubmit}
        className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col overflow-hidden"
      >
        <h3 className="font-semibold text-lg px-4 pt-4 pb-2 shrink-0">
          {trip ? "Rediger tur" : "Ny tur"}
        </h3>
        <div
          data-testid="trip-form-body"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-3"
        >
        <Field label="Navn" value={name} onChange={setName} />
        <Field label="Destinasjon" value={destination} onChange={setDestination} />
        <Field label="Land" value={country} onChange={setCountry} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Startdato" value={startDate} onChange={setStartDate} type="date" />
          <Field label="Sluttdato" value={endDate} onChange={setEndDate} type="date" />
        </div>

        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Destinasjon</h4>
            {destPreset && (
              <button
                type="button"
                onClick={() => {
                  setDest(destPreset);
                  setApplyVtRuntime(true);
                  toast.message("Verifisert Val Thorens-oppsett fylt inn – trykk Lagre");
                }}
                className="inline-flex items-center gap-1 text-xs px-2 py-2 rounded-lg bg-muted min-h-[44px]"
              >
                <Wand2 className="h-3.5 w-3.5" /> Fyll verifisert Val Thorens-oppsett
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Tidssone (IANA)"
              value={dest.timezone}
              onChange={(v) => setDest((d) => ({ ...d, timezone: v }))}
            />
            <Field
              label="Valuta (ISO)"
              value={dest.currency}
              onChange={(v) => setDest((d) => ({ ...d, currency: v }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Breddegrad"
              value={dest.lat}
              onChange={(v) => setDest((d) => ({ ...d, lat: v }))}
              type="text"
            />
            <Field
              label="Lengdegrad"
              value={dest.lon}
              onChange={(v) => setDest((d) => ({ ...d, lon: v }))}
              type="text"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Høyde (m, valgfri)"
              value={dest.elevation}
              onChange={(v) => setDest((d) => ({ ...d, elevation: v }))}
              type="text"
            />
            <Field
              label="Kartzoom (3–19)"
              value={dest.zoom}
              onChange={(v) => setDest((d) => ({ ...d, zoom: v }))}
              type="text"
            />
          </div>
          {parsedDest.error && (dest.lat || dest.lon || dest.timezone || dest.currency || dest.zoom) && (
            <p className="text-[11px] text-destructive">{parsedDest.error}</p>
          )}
        </div>

        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Oppdag</h4>
            {preset && (
              <button
                type="button"
                onClick={() => setDiscovery(preset)}
                className="inline-flex items-center gap-1 text-xs px-2 py-2 rounded-lg bg-muted min-h-[44px]"
              >
                <Wand2 className="h-3.5 w-3.5" /> Fyll trygt forslag
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {hasCenter
              ? `Søkesenter fra turens verifiserte koordinater (${center!.lat}, ${center!.lon}). Datoer påvirker ikke Oppdag.`
              : "Turen mangler verifisert senter. Fyll inn breddegrad og lengdegrad over før Oppdag kan slås på."}
          </p>

          <div>
            <span className="text-xs text-muted-foreground">Tilbydere</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {SUPPORTED_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProvider(p)}
                  aria-pressed={discovery.providers.includes(p)}
                  className={`rounded-full border px-3 py-2 text-xs min-h-[44px] ${
                    discovery.providers.includes(p)
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Kategorier</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {DISCOVER_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  aria-pressed={discovery.categories.includes(c)}
                  className={`rounded-full border px-3 py-2 text-xs min-h-[44px] ${
                    discovery.categories.includes(c)
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Radius (m)"
              value={String(discovery.radiusM)}
              onChange={(v) => setDiscovery((d) => ({ ...d, radiusM: Number(v) || 0 }))}
              type="number"
            />
            <Field
              label="Språk"
              value={discovery.language}
              onChange={(v) => setDiscovery((d) => ({ ...d, language: v }))}
            />
          </div>
        </div>

        </div>

        <div
          data-testid="trip-form-footer"
          className="shrink-0 flex justify-end gap-2 border-t border-border bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm min-h-[44px]"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm min-h-[44px] disabled:opacity-60"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </form>
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
