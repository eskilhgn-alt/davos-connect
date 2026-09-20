import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("WebcamsScreen", () => {
  it("bruker aldri ACTIVE_TRIP direkte", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../WebcamsScreen.tsx"), "utf8");
    expect(src).not.toMatch(/ACTIVE_TRIP/);
  });

  it("starter bare valgt panorama og beholder andre kameraer som lette valg", () => {
    currentTrip = vtTrip;
    const { container } = render(<WebcamsScreen />);
    const iframes = container.querySelectorAll("iframe");
    expect(iframes.length).toBe(1);
    expect(iframes[0].src).toContain("/valthorens/station");
    expect(screen.getAllByRole("button", { pressed: false }).length).toBe(VAL_THORENS_2027.webcams.length - 1);
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
    const { container } = render(<WebcamsScreen />);
    const originalPlayer = container.querySelector("iframe");
    const expandButtons = screen.getAllByRole("button", { name: /Utvid/i });
    fireEvent.click(expandButtons[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBe(originalPlayer);
    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector("iframe")).toBe(originalPlayer);
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

  it("lar brukeren prøve igjen etter timeout og bytter faktisk spilleren", () => {
    vi.useFakeTimers();
    currentTrip = vtTrip;
    const { container } = render(<WebcamsScreen />);
    const original = container.querySelector("iframe");
    act(() => vi.advanceTimersByTime(20_000));
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(container.querySelector("iframe")).not.toBe(original);
    expect(screen.getByText("Åpner kamera…")).toBeInTheDocument();
  });

  it("velger nytt kamera og nullstiller feil fra forrige kamera", () => {
    currentTrip = vtTrip;
    const { container } = render(<WebcamsScreen />);
    fireEvent.error(container.querySelector("iframe")!);
    fireEvent.click(screen.getByRole("button", { name: /^Cime Caron$/ }));
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelector("iframe")?.src).toContain("/cime-caron");
    expect(screen.queryByText("Kameraet er midlertidig utilgjengelig.")).toBeNull();
  });

  it("ber om ekte videoavspilling automatisk, dempet og inline", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "video", name: "Videokamera", externalUrl: "https://example.com", streamUrl: "https://example.com/live.mp4", mode: "video" },
    ] } };
    const { container } = render(<WebcamsScreen />);
    const video = container.querySelector("video")!;
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    fireEvent.playing(video);
    expect(screen.queryByText("Åpner kamera…")).toBeNull();
  });

  it("viser et fungerende startvalg hvis nettleseren nekter autoplay", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue();
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "video", name: "Videokamera", externalUrl: "https://example.com", streamUrl: "https://example.com/live.mp4", mode: "video" },
    ] } };
    render(<WebcamsScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Start avspilling" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it("oppdaterer stillbilder periodisk uten å bytte mediaelement", () => {
    vi.useFakeTimers();
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "still", name: "Still", externalUrl: "https://example.com", snapshotUrl: "https://example.com/latest.jpg", mode: "snapshot" },
    ] } };
    render(<WebcamsScreen />);
    const image = screen.getByRole("img", { name: "Bilde fra Still" });
    fireEvent.load(image);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("img", { name: "Bilde fra Still" })).toBe(image);
    expect(image.getAttribute("src")).toContain("guttahutte_refresh=");
  });
});
