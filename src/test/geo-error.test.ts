import { describe, it, expect } from "vitest";
import { geoErrorMessage } from "@/contexts/LocationSharingContext";

describe("geoErrorMessage", () => {
  it("gir en tydelig melding når tillatelsen er avslått", () => {
    const msg = geoErrorMessage(1);
    expect(msg).toMatch(/avsl(å|a)tt|innstillinger/i);
  });

  it("håndterer POSITION_UNAVAILABLE (2)", () => {
    expect(geoErrorMessage(2)).toMatch(/tilgjengelig/i);
  });

  it("håndterer TIMEOUT (3)", () => {
    expect(geoErrorMessage(3)).toMatch(/tidsavbrudd|prøv/i);
  });

  it("faller tilbake til en generisk melding for ukjente koder", () => {
    expect(geoErrorMessage(999)).toMatch(/kunne ikke/i);
  });

  it("returnerer alltid en ikke-tom streng", () => {
    for (const code of [0, 1, 2, 3, 42]) {
      expect(geoErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});
