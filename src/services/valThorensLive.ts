import { supabase } from "@/integrations/supabase/client";

export type LiftStatus =
  | "open"
  | "scheduled"
  | "closed"
  | "delayed"
  | "stopped"
  | "out_of_period"
  | "unknown";

export type LiveItemKind = "lifts" | "trails" | "connections" | "activities" | "other";

export interface ValThorensWeatherPoint {
  name: string;
  elevationM: number | null;
  morningTemperature: string | null;
  afternoonTemperature: string | null;
  wind: string | null;
  windDirection: string | null;
  freshSnow: string | null;
  conditionIcon: string | null;
}

export interface ValThorensLiveItem {
  name: string;
  status: LiftStatus;
  hours: string | null;
  typeIcon: string | null;
  groomingIcon: string | null;
}

export interface ValThorensLiveGroup {
  sector: string;
  kind: LiveItemKind;
  label: string;
  items: ValThorensLiveItem[];
}

export interface ValThorensLiveTotal {
  label: string;
  open: number;
  total: number;
}

export interface ValThorensLiveData {
  fetchedAt: string;
  updatedAtLabel: string | null;
  sourceUrl: string;
  weather: ValThorensWeatherPoint[];
  totals: ValThorensLiveTotal[];
  groups: ValThorensLiveGroup[];
  stale?: boolean;
}

/**
 * Cachen er identitetsbundet (tur + provider/config), ikke global. En annen
 * valgt tur/konfigurasjon leser aldri en annen turs live-data.
 */
export function liveCacheKey(scope: string): string {
  return `guttahutte:live-status:v2:${scope}`;
}
const FRESH_MS = 2 * 60 * 1000;
const MAX_STALE_MS = 12 * 60 * 60 * 1000;

interface CachedLiveData {
  savedAt: number;
  data: ValThorensLiveData;
}

function isLiveData(value: unknown): value is ValThorensLiveData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ValThorensLiveData>;
  return typeof data.fetchedAt === "string" && Array.isArray(data.groups) && Array.isArray(data.weather);
}

export function readValThorensLiveCache(
  scope: string,
  maxAgeMs = MAX_STALE_MS,
): CachedLiveData | null {
  if (!scope) return null;
  try {
    const raw = localStorage.getItem(liveCacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLiveData;
    if (!parsed || typeof parsed.savedAt !== "number" || !isLiveData(parsed.data)) return null;
    if (Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(scope: string, data: ValThorensLiveData): void {
  try {
    localStorage.setItem(liveCacheKey(scope), JSON.stringify({ savedAt: Date.now(), data } satisfies CachedLiveData));
  } catch {
    // Storage may be unavailable in private mode. Live data still works.
  }
}

export function isValThorensCacheFresh(cache: CachedLiveData | null): boolean {
  return Boolean(cache && Date.now() - cache.savedAt < FRESH_MS);
}

export async function fetchValThorensLive(scope: string): Promise<ValThorensLiveData> {
  const { data, error } = await supabase.functions.invoke<ValThorensLiveData>("val-thorens-live", {
    method: "GET",
  });
  if (error) throw new Error(error.message || "Kunne ikke hente live-data");
  if (!isLiveData(data)) throw new Error("Live-kilden svarte med ugyldige data");
  writeCache(scope, data);
  return data;
}

export function statusLabel(status: LiftStatus): string {
  switch (status) {
    case "open": return "Åpen";
    case "scheduled": return "Planlagt";
    case "closed": return "Stengt";
    case "delayed": return "Forsinket";
    case "stopped": return "Stoppet";
    case "out_of_period": return "Utenfor sesong";
    default: return "Ukjent";
  }
}

export function kindLabel(kind: LiveItemKind): string {
  switch (kind) {
    case "lifts": return "Heiser";
    case "trails": return "Løyper";
    case "connections": return "Forbindelser";
    case "activities": return "Aktiviteter";
    default: return "Annet";
  }
}
