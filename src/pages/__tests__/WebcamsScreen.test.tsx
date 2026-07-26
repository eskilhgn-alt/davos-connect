import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import { WebcamsScreen } from "../WebcamsScreen";
import { VAL_THORENS_2027 } from "@/config/trip";
import type { Trip } from "@/hooks/useActiveTrip";

let currentTrip: Trip | null = null;
vi.mock("@/contexts/TripContext", () => ({
  useTrip: () => ({ selectedTrip: currentTrip }),
}));
vi.mock("@/components/layout/BackButton", () => ({
  BackButton: () => <button aria-label="Tilbake">Tilbake</button>,
}));

const vtTrip: Trip = {
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

beforeEach(() => cleanup());

describe("WebcamsScreen", () => {
  it("bruker aldri ACTIVE_TRIP direkte", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../WebcamsScreen.tsx"), "utf8");
    expect(src).not.toMatch(/ACTIVE_TRIP/);
  });

  it("rendrer iframes eagerly for interaktive kameraer", () => {
    currentTrip = vtTrip;
    const { container } = render(<WebcamsScreen />);
    const iframes = container.querySelectorAll("iframe");
    const interactive = VAL_THORENS_2027.webcams.filter((c) => c.mode === "interactive");
    expect(iframes.length).toBe(interactive.length);
    iframes.forEach((f) => {
      expect(f.getAttribute("loading")).toBe("eager");
      expect(f.getAttribute("allow") ?? "").toMatch(/fullscreen/);
      expect(f.hasAttribute("allowfullscreen")).toBe(true);
    });
  });

  it("faller ikke tilbake til Val Thorens for annen destinasjon", () => {
    currentTrip = { ...vtTrip, id: "chamonix", destination: "Chamonix", destination_config: {} };
    const { container } = render(<WebcamsScreen />);
    expect(container.querySelectorAll("iframe").length).toBe(0);
    expect(screen.getByText(/Ingen webkameraer er konfigurert/i)).toBeInTheDocument();
  });

  it("åpner og lukker storvisning i appen", () => {
    currentTrip = vtTrip;
    render(<WebcamsScreen />);
    const expandButtons = screen.getAllByRole("button", { name: /Utvid/i });
    fireEvent.click(expandButtons[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("viser fallback for kamera uten spiller", () => {
    currentTrip = {
      ...vtTrip,
      destination: "Testdal",
      destination_config: {
        webcams: [
          { id: "solo", name: "Solo", externalUrl: "https://ex.com", mode: "snapshot" },
        ],
      },
    };
    render(<WebcamsScreen />);
    expect(screen.getByText(/midlertidig utilgjengelig/i)).toBeInTheDocument();
  });
});
