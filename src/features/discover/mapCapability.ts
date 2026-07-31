/**
 * EØS-guard for kartvisning av providerinnhold.
 *
 * Google Maps Platform EEA-vilkår (fra 8. juli 2025) tillater ikke at Places
 * API-innhold utover place_id/lat-lon vises sammen med et kart som ikke er
 * Google sitt eget. Places UI Kit er den aktuelle unntatte visningsmekanismen.
 *
 * Derfor: den generiske kartadapteren (Leaflet/OSM e.l.) skal ALDRI kunne
 * rendre Google Places-innhold. Vi viser heller en ærlig blokkert tilstand.
 *
 * Kilder:
 *  https://developers.google.com/maps/comms/eea/faq
 *  https://cloud.google.com/terms/maps-platform/eea/maps-service-terms
 */

export type MapRenderer = "generic" | "places-ui-kit";

export type MapCapability =
  | { allowed: true; renderer: "places-ui-kit" }
  | {
      allowed: false;
      reason: "eea_provider_content_blocked" | "map_not_configured" | "no_provider";
    };

/** Providere hvis innhold kun kan vises via providerens egen UI-mekanisme. */
const RESTRICTED_PROVIDERS = new Set(["google-places"]);

export function isRestrictedProvider(provider: string | null): boolean {
  return provider != null && RESTRICTED_PROVIDERS.has(provider);
}

/** Klientnøkkel for Places UI Kit. Må være HTTP-referrer-begrenset. */
export const BROWSER_KEY_NAME = "VITE_GOOGLE_MAPS_BROWSER_API_KEY";

export function browserMapKey(): string | null {
  const v = (import.meta.env as Record<string, string | undefined>)[BROWSER_KEY_NAME];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Avgjør om providerinnhold lovlig kan vises på kart i denne appen.
 * `genericMapAvailable` beskriver den eksisterende OSM-baserte adapteren.
 */
export function resolveMapCapability(input: {
  provider: string | null;
  browserKey?: string | null;
}): MapCapability {
  if (!input.provider) return { allowed: false, reason: "no_provider" };
  if (isRestrictedProvider(input.provider)) {
    const key = input.browserKey === undefined ? browserMapKey() : input.browserKey;
    if (!key) return { allowed: false, reason: "map_not_configured" };
    return { allowed: true, renderer: "places-ui-kit" };
  }
  // Ukjente/ikke-restriksjonsbelagte providere er ikke godkjent for den
  // generiske adapteren før vi har verifisert lisensen deres.
  return { allowed: false, reason: "eea_provider_content_blocked" };
}

export const MAP_BLOCKED_TEXT: Record<
  Extract<MapCapability, { allowed: false }>["reason"],
  string
> = {
  eea_provider_content_blocked:
    "Kart med disse stedsdataene er ikke tillatt i vår generiske kartvisning. Vi viser listen i stedet.",
  map_not_configured: `Kart er ikke konfigurert ennå. Google Places-innhold må vises via Places UI Kit, og krever ${BROWSER_KEY_NAME} (HTTP-referrer-begrenset).`,
  no_provider: "Stedsdata er ikke satt opp for denne turen ennå.",
};
