/**
 * targetSchema — ÉN eksplisitt, navngitt typeoverlegg for MÅLSKJEMAET etter at
 * Port 0-migrasjonene (20260813 → 20260814 → 20260815) faktisk er kjørt.
 *
 * VIKTIG, uten pynt:
 *  - `src/integrations/supabase/types.ts` er GENERERT fra PRODUKSJON, som per
 *    nå står på migrasjon 20260727074822. Den beskriver altså PRE-migration
 *    skjema: `trip_status = active|archived` og `user_locations` uten
 *    `id`/`trip_id`.
 *  - Denne filen er HÅNDSKREVET og er IKKE generert. Den er ikke et forsøk på
 *    å se ut som generert output; den er et eksplisitt, testet overlegg over
 *    de nøyaktige tabellene/enumene Port 0 endrer.
 *  - Når Port 0-migrasjonene er kjørt og `types.ts` regenereres fra det
 *    faktiske skjemaet, skal denne filen SLETTES og `targetDb` byttes til
 *    `supabase` uten atferdsendring.
 *
 * Konsekvens: HEAD/preview er inkompatibel med produksjonsskjemaet inntil
 * migrasjonsrekkefølgen er kjørt manuelt. Ikke publiser før det er gjort.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as GeneratedDatabase } from "./types";
import { supabase } from "./client";

/** Målskjemaets `public.trip_status`. Speiler `@/features/trip/tripStatus`. */
export type TargetTripStatus = "draft" | "active" | "archived";

type GeneratedPublic = GeneratedDatabase["public"];
type GeneratedTables = GeneratedPublic["Tables"];
type GeneratedTrips = GeneratedTables["trips"];

/** `public.user_locations` etter 20260815: surrogat-PK + turbinding. */
export interface TargetUserLocationsTable {
  Row: {
    /** Surrogat-PK. Backfilles for eksisterende rader i migrasjonen. */
    id: string;
    user_id: string;
    /** NULL kun for legacy-rader fra før Port 0. Aldri skrivbare. */
    trip_id: string | null;
    lat: number;
    lon: number;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    trip_id: string;
    lat: number;
    lon: number;
    updated_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    trip_id?: string;
    lat?: number;
    lon?: number;
    updated_at?: string;
  };
  Relationships: [];
}

/** `public.trips` etter 20260814: statusenumen har `draft`. */
interface TargetTripsTable {
  Row: Omit<GeneratedTrips["Row"], "status"> & { status: TargetTripStatus };
  Insert: Omit<GeneratedTrips["Insert"], "status"> & { status?: TargetTripStatus };
  Update: Omit<GeneratedTrips["Update"], "status"> & { status?: TargetTripStatus };
  Relationships: GeneratedTrips["Relationships"];
}

export type TargetDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Enums"> & {
    Tables: Omit<GeneratedTables, "user_locations" | "trips"> & {
      user_locations: TargetUserLocationsTable;
      trips: TargetTripsTable;
    };
    Enums: Omit<GeneratedPublic["Enums"], "trip_status"> & {
      trip_status: TargetTripStatus;
    };
  };
};

export type TargetUserLocationRow = TargetUserLocationsTable["Row"];

/**
 * Den ENE inngangen til målskjemaet. Ingen `any`, ingen spredte casts:
 * typecheck verifiserer faktisk kolonnenavn, sammensatt `(trip_id,user_id)`
 * og statusverdier mot overlegget over.
 */
export const targetDb = supabase as unknown as SupabaseClient<TargetDatabase>;
