import { describe, it, expect } from "vitest";
import { resolveWebcams } from "../resolveWebcams";
import { VAL_THORENS_2027 } from "@/config/trip";
import type { Trip } from "@/hooks/useActiveTrip";

const baseTrip: Trip = {
  id: "val-thorens-2027",
  name: "Val Thorens 2027",
  destination: "Val Thorens",
  country: "Frankrike",
  timezone: "Europe/Paris",
  currency: "EUR",
  start_date: null,
  end_date: null,
  status: "active",
  destination_config: {},
};

describe("resolveWebcams", () => {
  it("returnerer tom liste når trip mangler", () => {
    expect(resolveWebcams(null)).toEqual([]);
  });

  it("bruker webcams fra destination_config når tilgjengelig", () => {
    const cams = [
      { id: "x", name: "X", externalUrl: "https://ex.com", playerUrl: "https://ex.com", provider: "Test", mode: "interactive" as const },
    ];
    const t: Trip = { ...baseTrip, destination: "Chamonix", destination_config: { webcams: cams } };
    expect(resolveWebcams(t)).toEqual(cams);
  });

  it("faller tilbake til Val Thorens-konfig kun for Val Thorens", () => {
    const t: Trip = { ...baseTrip, destination_config: {} };
    expect(resolveWebcams(t)).toEqual(expect.arrayContaining(VAL_THORENS_2027.webcams));
    expect(resolveWebcams(t)).toHaveLength(VAL_THORENS_2027.webcams.length);
  });

  it("returnerer aldri Val Thorens-fallback for annen destinasjon", () => {
    const t: Trip = { ...baseTrip, id: "chamonix-2028", destination: "Chamonix", destination_config: {} };
    expect(resolveWebcams(t)).toEqual([]);
  });

  it("filtrerer bort ugyldige webcam-oppføringer", () => {
    const t: Trip = {
      ...baseTrip,
      destination: "Andorra",
      destination_config: {
        webcams: [
          { id: "ok", name: "Ok", externalUrl: "https://a.b" },
          { name: "mangler id", externalUrl: "https://a.b" },
          "junk",
        ],
      },
    };
    expect(resolveWebcams(t)).toHaveLength(1);
  });

  it("alle Skaping-kameraer bruker timelapse med eksplisitt offentlig kamera-ID", () => {
    const interactive = VAL_THORENS_2027.webcams.filter((c) => c.mode === "timelapse");
    expect(interactive.length).toBeGreaterThan(0);
    for (const c of interactive) { expect(c.playerUrl).toMatch(/^https:\/\/www\.skaping\.com\//); expect(c.skapingCameraKey).toBeTruthy(); }
  });
  it("oppgraderer lagret Skaping-konfig uten å endre navn eller rekkefølge", () => {
    const station = VAL_THORENS_2027.webcams.find(c => c.id === "station")!;
    const old = { id: "custom", name: "Mitt kamera", externalUrl: station.externalUrl, playerUrl: station.playerUrl, mode: "interactive" };
    const result = resolveWebcams({ ...baseTrip, destination_config: { webcams: [old] } });
    expect(result[0]).toMatchObject({ id: "custom", name: "Mitt kamera", mode: "timelapse", skapingCameraKey: station.skapingCameraKey });
    expect(old.mode).toBe("interactive");
  });
});
