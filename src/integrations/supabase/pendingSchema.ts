/**
 * pendingSchema — smal, eksplisitt bro mot kolonner som finnes i
 * `supabase/migrations-pending/` men ennå IKKE i den genererte `types.ts`.
 *
 * Bakgrunn: `types.ts` genereres fra produksjonsskjemaet og kan ikke redigeres
 * for hånd. Port 0c legger til `user_locations.id` (surrogat-PK),
 * `user_locations.trip_id` + `UNIQUE(trip_id, user_id)`, og utvider
 * `trip_status` med `draft`. Inntil migrasjonen faktisk er kjørt, holder vi
 * avviket ETT sted i stedet for å strø `as any` rundt i klienten.
 *
 * Når migrasjonen er kjørt og typene regenerert, kan denne filen fjernes og
 * kallene byttes tilbake til den typede klienten uten atferdsendring.
 */
import { supabase } from "./client";

export interface UserLocationRow {
  /** Surrogat-PK. Backfilles for eksisterende rader ved migrasjon. */
  id: string;
  user_id: string;
  trip_id: string | null;
  lat: number;
  lon: number;
  updated_at: string;
}

interface LooseTable {
  select: (columns: string) => LooseTable;
  eq: (column: string, value: string) => LooseTable;
  in: (column: string, values: string[]) => LooseTable;
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => Promise<{ error: { message: string } | null }>;
  delete: () => LooseTable;
  then: <T>(
    onfulfilled: (v: { data: unknown; error: { message: string } | null }) => T,
  ) => Promise<T>;
}

/**
 * Kun for tabeller/kolonner som er dekket av pending-migrasjonene.
 * Ikke bruk denne til noe annet.
 */
export function pendingFrom(table: "user_locations"): LooseTable {
  return (supabase as unknown as { from: (t: string) => LooseTable }).from(table);
}
