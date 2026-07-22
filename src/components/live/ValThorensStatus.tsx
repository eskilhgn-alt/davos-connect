import * as React from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Search, Snowflake } from "lucide-react";
import { useValThorensLive } from "@/hooks/useValThorensLive";
import { kindLabel, statusLabel, type LiftStatus, type LiveItemKind } from "@/services/valThorensLive";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | LiveItemKind;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Åpne" },
  { value: "lifts", label: "Heiser" },
  { value: "trails", label: "Løyper" },
  { value: "connections", label: "Forbindelser" },
];

function statusColor(status: LiftStatus) {
  if (status === "open") return "bg-emerald-500";
  if (status === "scheduled") return "bg-amber-500";
  if (status === "closed" || status === "stopped") return "bg-red-500";
  return "bg-muted-foreground";
}

export const ValThorensStatus: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { data, loading, error, refresh } = useValThorensLive();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.groups ?? []).flatMap((group) => group.items.map((item) => ({ ...item, sector: group.sector, kind: group.kind })))
      .filter((item) => filter === "all" || (filter === "open" ? item.status === "open" : item.kind === filter))
      .filter((item) => !needle || `${item.name} ${item.sector}`.toLowerCase().includes(needle));
  }, [data?.groups, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-foreground">Live fra skiområdet</h2>
          <p className="text-[11px] text-muted-foreground truncate">
            {data?.updatedAtLabel || "Heiser, løyper og forbindelser"}{data?.stale ? " · lagret visning" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh().catch(() => undefined)}
          className="tap-target flex items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-label="Oppdater status"
        >
          <RefreshCw size={17} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {data?.weather?.length ? (
        <div className="grid grid-cols-2 gap-2">
          {data.weather.slice(0, 2).map((point, index) => (
            <div key={`${point.name}-${point.elevationM ?? index}`} className="rounded-xl border border-border bg-muted/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground truncate">{point.elevationM ? `${point.elevationM} moh.` : point.name}</p>
                <Snowflake size={13} className="text-primary shrink-0" />
              </div>
              <p className="font-heading text-lg font-bold text-foreground mt-1">{point.afternoonTemperature || point.morningTemperature || "–"}</p>
              <p className="text-[10px] text-muted-foreground truncate">Vind {point.wind || "–"}{point.windDirection ? ` ${point.windDirection}` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}

      {data?.totals?.length ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {data.totals.map((total, index) => (
            <div key={`${total.label}-${index}`} className="shrink-0 rounded-xl border border-border bg-card px-3 py-2">
              <p className="font-heading text-sm font-bold text-foreground tabular-nums">{total.open}/{total.total}</p>
              <p className="text-[10px] text-muted-foreground max-w-24 truncate">{total.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Søk etter heis eller løype"
          className="w-full h-11 rounded-xl border border-border bg-muted/30 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors",
              filter === option.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="animate-spin" size={22} /></div>
      ) : error && !data ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2">
          <AlertCircle size={17} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ingen treff i gjeldende filter.</p>
      ) : (
        <div className={cn("rounded-2xl border border-border bg-card divide-y divide-border", compact && "max-h-[48vh] overflow-y-auto")}> 
          {rows.map((item, index) => (
            <div key={`${item.sector}-${item.kind}-${item.name}-${index}`} className="flex items-center gap-3 p-3">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusColor(item.status))} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.sector} · {kindLabel(item.kind)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-[11px] font-semibold", item.status === "open" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{statusLabel(item.status)}</p>
                {item.hours && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock3 size={9} />{item.hours}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && !error && (
        <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/70">
          <CheckCircle2 size={11} /> Offisiell live-feed fra Val Thorens / Lumiplan
        </p>
      )}
    </div>
  );
};
