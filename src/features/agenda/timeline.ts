/**
 * agenda/timeline — rene, testbare regler for Agenda-tidslinjen.
 *
 * Agenda er én vertikal, kronologisk tidslinje (ingen kalendergrid). Dager
 * grupperes på lokal dato i turens tidssone, og aktiviteter utenfor
 * turdatoene beholdes alltid — de merkes bare «Utenfor turdatoene».
 */
import {
  formatDayHeading,
  tripDayNumber,
  zonedDateKey,
  type TripDateInput,
} from "@/features/trip/tripDates";

export interface TimelineEventInput {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  color: string | null;
}

export type EventStatus = "past" | "ongoing" | "upcoming";

export interface TimelineEvent extends TimelineEventInput {
  status: EventStatus;
}

export interface TimelineDay {
  dateKey: string;
  heading: string;
  /** Turdag 1..n, eller null når dagen er utenfor turdatoene. */
  tripDay: number | null;
  outsideTrip: boolean;
  events: TimelineEvent[];
}

export function eventStatus(ev: TimelineEventInput, now: Date): EventStatus {
  const start = Date.parse(ev.start_at);
  const end = Date.parse(ev.end_at);
  if (Number.isFinite(end) && now.getTime() >= end) return "past";
  if (Number.isFinite(start) && now.getTime() >= start) return "ongoing";
  return "upcoming";
}

/** Grupperer og sorterer hele turens tidslinje. */
export function buildTimeline(
  events: TimelineEventInput[],
  trip: (TripDateInput & { timezone?: string | null }) | null | undefined,
  now: Date = new Date(),
): TimelineDay[] {
  const tz = trip?.timezone ?? "UTC";
  const byDay = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = zonedDateKey(ev.start_at, tz);
    const list = byDay.get(key) ?? [];
    list.push({ ...ev, status: eventStatus(ev, now) });
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([dateKey, list]) => {
      const tripDay = tripDayNumber(dateKey, trip);
      return {
        dateKey,
        heading: formatDayHeading(dateKey, tz),
        tripDay,
        outsideTrip: !!trip?.start_date && !!trip?.end_date && tripDay === null,
        events: list.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at)),
      };
    });
}

/**
 * Fokusaktivitet: pågående først, ellers neste kommende, ellers siste
 * relevante (avsluttede turer scroller til siste dag).
 */
export function pickFocusEventId(days: TimelineDay[], now: Date = new Date()): string | null {
  const flat = days.flatMap((d) => d.events);
  if (flat.length === 0) return null;
  const ongoing = flat.find((e) => eventStatus(e, now) === "ongoing");
  if (ongoing) return ongoing.id;
  const next = flat.find((e) => eventStatus(e, now) === "upcoming");
  if (next) return next.id;
  return flat[flat.length - 1].id;
}

/** Neste kommende (eller pågående) aktivitet — samme kilde som Hjem «Neste». */
export function pickNextEvent<T extends TimelineEventInput>(
  events: T[],
  now: Date = new Date(),
): T | null {
  const sorted = [...events].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return (
    sorted.find((e) => eventStatus(e, now) === "ongoing") ??
    sorted.find((e) => eventStatus(e, now) === "upcoming") ??
    null
  );
}
