/**
 * Central trip configuration for GüttaHütte.
 *
 * GüttaHütte is a generic, reusable travel/crew app. All destination-dependent
 * surfaces (home, weather, maps, webcams, emergency info, agenda, etc.) should
 * read from this file — not from hard-coded destination-specific references
 * scattered across the codebase.
 *
 * Active trip: Val Thorens 2027. Exact February 2027 dates are not confirmed;
 * `startDate` and `endDate` are intentionally `null` and must be filled in
 * later. All UI that uses dates must handle `null` gracefully.
 */

export interface TripCoordinate {
  lat: number;
  lon: number;
  /** Elevation in meters above sea level, when relevant. */
  elevation?: number;
}

export interface TripPeak extends TripCoordinate {
  id: string;
  name: string;
  elevation: number;
}

export interface TripLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  /** Whether the URL is safe to embed in an iframe. Assume `false` unless verified. */
  embeddable?: boolean;
}

export interface TripWebcamRef {
  id: string;
  name: string;
  area?: string;
  /** External page (fallback for `open in browser`). */
  externalUrl: string;
  /** Direct snapshot image URL, when we have one that we control. Optional. */
  snapshotUrl?: string;
}

export interface EmergencyContact {
  label: string;
  value: string;
  /** `tel:`, `https:` or `mailto:` link. */
  href?: string;
}

export interface EmergencyGroup {
  id: string;
  title: string;
  contacts: EmergencyContact[];
  /** Highlight the group (e.g. life-critical numbers). */
  accent?: boolean;
}

export interface TripConfig {
  /** Stable slug – safe to persist. */
  id: string;
  /** Short label shown in UI, e.g. "Val Thorens 2027". */
  label: string;
  destination: string;
  country: string;
  /** IANA timezone, e.g. `Europe/Paris`. */
  timezone: string;
  /** ISO 4217 currency code, e.g. `EUR`. */
  currency: string;
  /** ISO date string (`YYYY-MM-DD`) or null when not yet confirmed. */
  startDate: string | null;
  endDate: string | null;
  /** Map center used by map/weather surfaces. */
  center: TripCoordinate;
  peaks: TripPeak[];
  officialLinks: {
    trailMap?: TripLink;
    weather?: TripLink;
    safety?: TripLink;
    webcams?: TripLink;
  };
  webcams: TripWebcamRef[];
  emergency: EmergencyGroup[];
  /** True when the destination is in a country/region we do not have
   *  full first-party integrations for yet. Purely informational. */
  integrationsPending?: boolean;
}

// -- Val Thorens 2027 -------------------------------------------------------

export const VAL_THORENS_2027: TripConfig = {
  id: "val-thorens-2027",
  label: "Val Thorens 2027",
  destination: "Val Thorens",
  country: "Frankrike",
  timezone: "Europe/Paris",
  currency: "EUR",
  // Datoer i februar 2027 er ikke bekreftet ennå.
  startDate: null,
  endDate: null,
  center: { lat: 45.2978, lon: 6.5802, elevation: 2300 },
  peaks: [
    { id: "cime-caron", name: "Cime Caron", lat: 45.3070, lon: 6.5528, elevation: 3200 },
    { id: "pointe-thorens", name: "Pointe de Thorens", lat: 45.3237, lon: 6.5847, elevation: 3266 },
    { id: "aiguille-peclet", name: "Aiguille de Péclet", lat: 45.3199, lon: 6.5697, elevation: 3561 },
    { id: "mont-chambre", name: "Mont de la Chambre", lat: 45.3200, lon: 6.5417, elevation: 2850 },
    { id: "la-masse", name: "La Masse", lat: 45.2850, lon: 6.5389, elevation: 2804 },
  ],
  officialLinks: {
    trailMap: {
      id: "trail-map",
      title: "Offisielt løypekart",
      url: "https://www.valthorens.com/en/ski/plan/",
      description: "Live løypekart fra Val Thorens",
      embeddable: false,
    },
    weather: {
      id: "weather",
      title: "Vær & skred (Meteo-France)",
      url: "https://meteofrance.com/meteo-montagne/val-thorens/732573",
      description: "Offisiell fjellprognose og skredvarsel",
      embeddable: false,
    },
    safety: {
      id: "safety",
      title: "Sikkerhet & redning",
      url: "https://www.valthorens.com/en/ski/securite-secours/",
      embeddable: false,
    },
    webcams: {
      id: "webcams",
      title: "Alle webkameraer",
      url: "https://www.valthorens.com/en/webcams/",
      embeddable: false,
    },
  },
  webcams: [
    {
      id: "valthorens-official",
      name: "Val Thorens live",
      area: "Sentrum",
      externalUrl: "https://www.valthorens.com/en/webcams/",
    },
  ],
  emergency: [
    {
      id: "emergency-numbers",
      title: "Nødnumre (Frankrike)",
      accent: true,
      contacts: [
        { label: "Europeisk nødnummer", value: "112", href: "tel:112" },
        { label: "Medisinsk nødhjelp (SAMU)", value: "15", href: "tel:15" },
        { label: "Politi", value: "17", href: "tel:17" },
        { label: "Brann", value: "18", href: "tel:18" },
      ],
    },
    {
      id: "mountain-rescue",
      title: "Skipatrulje & redning",
      contacts: [
        { label: "Val Thorens skipatrulje", value: "+33 4 79 00 01 80", href: "tel:+33479000180" },
        { label: "Sikkerhet & redning (info)", value: "valthorens.com", href: "https://www.valthorens.com/en/ski/securite-secours/" },
      ],
    },
    {
      id: "consulate",
      title: "Norsk representasjon",
      contacts: [
        { label: "Norsk ambassade (Paris)", value: "+33 1 53 67 04 00", href: "tel:+33153670400" },
      ],
    },
  ],
  integrationsPending: true,
};

/**
 * The single active trip. Everything destination-specific should read from
 * `ACTIVE_TRIP` (or accept a `TripConfig` as a parameter) so we can swap
 * trips later without editing components.
 */
export const ACTIVE_TRIP: TripConfig = VAL_THORENS_2027;

// -- Helpers ----------------------------------------------------------------

export function tripHasConfirmedDates(trip: TripConfig = ACTIVE_TRIP): boolean {
  return Boolean(trip.startDate && trip.endDate);
}

/** Days until start. Returns `null` when the start date is not confirmed. */
export function tripDaysUntilStart(trip: TripConfig = ACTIVE_TRIP, now: Date = new Date()): number | null {
  if (!trip.startDate) return null;
  const start = new Date(trip.startDate + "T00:00:00");
  const ms = start.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
