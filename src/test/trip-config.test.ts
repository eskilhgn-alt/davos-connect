import { describe, it, expect } from "vitest";
import { ACTIVE_TRIP } from "@/config/trip";

describe("ACTIVE_TRIP config", () => {
  it("er satt til Val Thorens 2027", () => {
    expect(ACTIVE_TRIP.destination).toMatch(/Val Thorens/i);
    expect(ACTIVE_TRIP.country).toBe("Frankrike");
    expect(ACTIVE_TRIP.currency).toBe("EUR");
    expect(ACTIVE_TRIP.timezone).toBe("Europe/Paris");
  });

  it("har kartkoordinater innenfor Val Thorens-området", () => {
    expect(ACTIVE_TRIP.center.lat).toBeGreaterThan(45.2);
    expect(ACTIVE_TRIP.center.lat).toBeLessThan(45.4);
    expect(ACTIVE_TRIP.center.lon).toBeGreaterThan(6.5);
    expect(ACTIVE_TRIP.center.lon).toBeLessThan(6.7);
  });

  it("tillater manglende datoer uten å kaste (nullable)", () => {
    // Datoer er bevisst nullable inntil de bekreftes.
    expect([null, undefined, expect.any(String)]).toContainEqual(
      ACTIVE_TRIP.startDate ?? null
    );
    expect([null, undefined, expect.any(String)]).toContainEqual(
      ACTIVE_TRIP.endDate ?? null
    );
  });

  it("eksponerer nødkontakter med franske numre", () => {
    const numbers = ACTIVE_TRIP.emergency.map((e) => e.number).join(" ");
    expect(numbers).toMatch(/112/);
  });

  it("har offisielle Val Thorens-lenker", () => {
    expect(ACTIVE_TRIP.officialLinks.trailMap).toMatch(/valthorens\.com/);
    expect(ACTIVE_TRIP.officialLinks.webcams).toMatch(/valthorens\.com/);
    expect(ACTIVE_TRIP.officialLinks.weather).toMatch(/meteofrance\.com/);
  });
});
