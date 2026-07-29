/**
 * Oppdag — provider-nøytral kontrakt.
 *
 * Kontrakt:
 *  - Klienten sender ALDRI koordinater. Serveren leser destinasjonssenter
 *    fra valgt turs `destination_config`.
 *  - Svaret er delt/likt for alle brukere med samme tur + cacheversjon.
 *    Personlig avstand beregnes lokalt og inngår ikke i delt data.
 */

export const DISCOVER_CATEGORIES = ["spise", "afterski", "aktiviteter", "praktisk"] as const;
export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DiscoverCategory, string> = {
  spise: "Spise",
  afterski: "Afterski",
  aktiviteter: "Aktiviteter",
  praktisk: "Praktisk",
};

export function isDiscoverCategory(x: unknown): x is DiscoverCategory {
  return typeof x === "string" && (DISCOVER_CATEGORIES as readonly string[]).includes(x);
}

/** Ett sted, normalisert bort fra provider-spesifikk form. */
export interface DiscoverPlace {
  /** Provider-uavhengig, stabil id (provider-prefikset). */
  id: string;
  name: string;
  category: DiscoverCategory;
  lat: number;
  lon: number;
  address: string | null;
  /** 0–5, provider-rating. Merkes alltid med kilden i UI. */
  rating: number | null;
  ratingCount: number | null;
  /** 1–4 når kjent. */
  priceLevel: number | null;
  openNow: boolean | null;
  /** Lovlig visbar bilde-URL, eller null. */
  photoUrl: string | null;
  /** Lenke til providerens egen side (attribution-krav). */
  providerUrl: string | null;
}

export interface DiscoverResponse {
  tripId: string;
  category: DiscoverCategory;
  /** trip_id + destination-config-versjon + provider + kategori. */
  cacheKey: string;
  /** F.eks. "google-places". Null når ingen provider er konfigurert. */
  provider: string | null;
  /** Vises alltid når provider = google-places. */
  attribution: string | null;
  places: DiscoverPlace[];
  fetchedAt: string;
}

export type DiscoverErrorCode =
  | "unauthorized"
  | "not_approved"
  | "not_trip_member"
  | "invalid_category"
  | "destination_not_configured"
  | "provider_not_configured"
  | "provider_error"
  | "rate_limited"
  | "timeout";
