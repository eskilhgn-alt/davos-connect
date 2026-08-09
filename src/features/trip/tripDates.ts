/**
 * tripDates — én testet, tidssone-korrekt kilde for alle turdatoer.
 *
 * Kontrakt:
 *  - Aldri `new Date("YYYY-MM-DD")`. Datoer i `trips.start_date/end_date` er
 *    rene kalenderdatoer og tolkes alltid i turens tidssone.
 *  - Sluttdato er INKLUDERENDE: turen varer ut hele sluttdagen lokalt.
 *  - Fase (upcoming/ongoing/ended) er avledet av dato og brukes bare til
 *    presentasjon. `trips.status` (active/archived) er fortsatt et eksplisitt
 *    adminvalg og skal ALDRI endres automatisk av dato.
 */

export type TripPhase = "unknown" | "upcoming" | "ongoing" | "ended";

export interface TripDateInput {
  start_date?: string | null;
  end_date?: string | null;
  timezone?: string | null;
}

const DAY_MS = 86_400_000;
const DEFAULT_TZ = "UTC";

function safeTz(tz?: string | null): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Offset (ms) mellom UTC og tidssonen på et gitt tidspunkt. */
export function timezoneOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(tz),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/** Lokal kalenderdato (`YYYY-MM-DD`) for et tidspunkt i gitt tidssone. */
export function zonedDateKey(at: Date | string, tz?: string | null): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(d);
}

/** UTC-instant for lokal midnatt på en kalenderdato — DST-sikker. */
export function zonedStartOfDay(dateKey: string, tz?: string | null): Date {
  const base = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(base)) return new Date(NaN);
  const zone = safeTz(tz);
  let ts = base - timezoneOffsetMs(zone, new Date(base));
  ts = base - timezoneOffsetMs(zone, new Date(ts));
  return new Date(ts);
}

/** Legger til hele kalenderdager på en datonøkkel (ingen DST-drift). */
export function addDaysToKey(dateKey: string, days: number): string {
  const base = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(base)) return dateKey;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** Antall hele kalenderdager mellom to datonøkler (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Start <= slutt. Tomme datoer regnes som gyldige (ikke satt). */
export function validateTripDates(start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  return dayDiff(start, end) >= 0;
}

export function tripHasDates(trip: TripDateInput | null | undefined): boolean {
  return !!trip?.start_date && !!trip?.end_date;
}

/** Turvindu i faktiske instanter. Sluttdato inkluderes helt ut. */
export function tripWindow(
  trip: TripDateInput | null | undefined,
): { start: Date; endExclusive: Date } | null {
  if (!tripHasDates(trip)) return null;
  const tz = safeTz(trip?.timezone);
  const start = zonedStartOfDay(trip!.start_date!, tz);
  const endExclusive = zonedStartOfDay(addDaysToKey(trip!.end_date!, 1), tz);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return null;
  return { start, endExclusive };
}

/** Presentasjonsfase. Endrer ALDRI trips.status. */
export function tripPhase(trip: TripDateInput | null | undefined, now: Date = new Date()): TripPhase {
  const w = tripWindow(trip);
  if (!w) return "unknown";
  if (now.getTime() < w.start.getTime()) return "upcoming";
  if (now.getTime() >= w.endExclusive.getTime()) return "ended";
  return "ongoing";
}

/** Hele dager til turstart i turens tidssone. Null når datoer mangler. */
export function daysUntilTripStart(
  trip: TripDateInput | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!trip?.start_date) return null;
  const tz = safeTz(trip.timezone);
  return dayDiff(zonedDateKey(now, tz), trip.start_date);
}

/** Turdag 1..n for en kalenderdato, eller null utenfor turen. */
export function tripDayNumber(dateKey: string, trip: TripDateInput | null | undefined): number | null {
  if (!tripHasDates(trip)) return null;
  const n = dayDiff(trip!.start_date!, dateKey) + 1;
  const total = dayDiff(trip!.start_date!, trip!.end_date!) + 1;
  return n >= 1 && n <= total ? n : null;
}

/** Er datoen innenfor turperioden? */
export function isWithinTripDates(dateKey: string, trip: TripDateInput | null | undefined): boolean {
  return tripDayNumber(dateKey, trip) !== null;
}

function fmt(dateKey: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  const d = zonedStartOfDay(dateKey, tz);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("nb-NO", { timeZone: tz, ...opts }).format(d);
}

/** «10. feb – 17. feb 2027» eller «Datoer ikke satt». */
export function formatTripDateRange(trip: TripDateInput | null | undefined): string {
  if (!tripHasDates(trip)) return "Datoer ikke satt";
  const tz = safeTz(trip?.timezone);
  const from = fmt(trip!.start_date!, tz, { day: "numeric", month: "short" });
  const to = fmt(trip!.end_date!, tz, { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${to}`;
}

/** «tirsdag 10. februar» for en tidslinjedag. */
export function formatDayHeading(dateKey: string, tz?: string | null): string {
  return fmt(dateKey, safeTz(tz), { weekday: "long", day: "numeric", month: "long" });
}

/** «08:30» i turens tidssone. */
export function formatZonedTime(at: Date | string, tz?: string | null): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: safeTz(tz),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
