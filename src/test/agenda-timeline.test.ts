import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildTimeline, pickFocusEventId, pickNextEvent, eventStatus } from "@/features/agenda/timeline";

const trip = { start_date: "2027-02-10", end_date: "2027-02-12", timezone: "Europe/Paris" };

const ev = (id: string, start: string, end: string) => ({
  id,
  title: `E${id}`,
  description: null,
  color: null,
  start_at: start,
  end_at: end,
});

const events = [
  ev("c", "2027-02-12T09:00:00Z", "2027-02-12T10:00:00Z"),
  ev("a", "2027-02-10T09:00:00Z", "2027-02-10T10:00:00Z"),
  ev("b", "2027-02-10T07:00:00Z", "2027-02-10T08:00:00Z"),
  ev("outside", "2027-02-20T09:00:00Z", "2027-02-20T10:00:00Z"),
];

describe("agenda timeline", () => {
  it("grupperer per lokal dato og sorterer kronologisk", () => {
    const days = buildTimeline(events, trip, new Date("2027-02-01T00:00:00Z"));
    expect(days.map((d) => d.dateKey)).toEqual(["2027-02-10", "2027-02-12", "2027-02-20"]);
    expect(days[0].events.map((e) => e.id)).toEqual(["b", "a"]);
    expect(days[0].tripDay).toBe(1);
    expect(days[1].tripDay).toBe(3);
  });

  it("beholder aktiviteter utenfor turdatoene og merker dem", () => {
    const days = buildTimeline(events, trip, new Date("2027-02-01T00:00:00Z"));
    const last = days[days.length - 1];
    expect(last.outsideTrip).toBe(true);
    expect(last.tripDay).toBeNull();
    expect(last.events).toHaveLength(1); // aldri slettet
  });

  it("henter hendelser utenfor inneværende uke", () => {
    const days = buildTimeline([ev("far", "2027-06-01T09:00:00Z", "2027-06-01T10:00:00Z")], trip);
    expect(days).toHaveLength(1);
  });

  it("fokuserer neste før turen, pågående under turen, siste etter turen", () => {
    const before = buildTimeline(events, trip, new Date("2027-02-01T00:00:00Z"));
    expect(pickFocusEventId(before, new Date("2027-02-01T00:00:00Z"))).toBe("b");

    const during = buildTimeline(events, trip, new Date("2027-02-10T09:30:00Z"));
    expect(pickFocusEventId(during, new Date("2027-02-10T09:30:00Z"))).toBe("a");

    const after = new Date("2027-03-01T00:00:00Z");
    expect(pickFocusEventId(buildTimeline(events, trip, after), after)).toBe("outside");
  });

  it("pickNextEvent gir pågående før kommende", () => {
    const now = new Date("2027-02-10T09:30:00Z");
    expect(pickNextEvent(events, now)?.id).toBe("a");
    expect(pickNextEvent(events, new Date("2027-02-11T00:00:00Z"))?.id).toBe("c");
    expect(eventStatus(events[1], new Date("2027-03-01T00:00:00Z"))).toBe("past");
  });
});

describe("agenda datalag-kontrakt", () => {
  const hook = readFileSync("src/hooks/useAgenda.ts", "utf8");
  const screen = readFileSync("src/pages/AgendaScreen.tsx", "utf8");

  it("scoper alle mutasjoner på trip_id", () => {
    const updateBlock = hook.slice(hook.indexOf("const updateEvent"), hook.indexOf("const deleteEvent"));
    const deleteBlock = hook.slice(hook.indexOf("const deleteEvent"));
    expect(updateBlock).toContain('.eq("trip_id"');
    expect(deleteBlock).toContain('.eq("trip_id"');
    expect(hook).toContain("trip_id: selectedTripId");
  });

  it("blokkerer skriving i arkivmodus", () => {
    expect(hook).toContain("Arkivmodus – kan ikke opprette aktiviteter");
    expect(hook).toContain("Arkivmodus – kan ikke endre aktiviteter");
    expect(hook).toContain("Arkivmodus – kan ikke slette aktiviteter");
  });

  it("bruker React Query slik at invalidering av «agenda» virker", () => {
    expect(hook).toContain("useQuery");
    expect(hook).toContain('["agenda", tripId]');
  });

  it("har ingen kalendergrid, ukevelger eller usikret jumpToNextEvent igjen", () => {
    expect(screen).not.toContain("jumpToNextEvent");
    expect(screen).not.toContain("weekOffset");
    expect(screen).not.toContain("HOUR_HEIGHT");
    expect(hook).not.toContain("startOfWeek");
  });
});
