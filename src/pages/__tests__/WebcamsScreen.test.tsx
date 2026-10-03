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

const panoramaTrip: Trip = { ...vtTrip, destination_config: { webcams: [
  { id: "station", name: "Station", mode: "interactive", playerUrl: "https://example.com/valthorens/station", externalUrl: "https://example.com" },
  { id: "caron", name: "Cime Caron", mode: "interactive", playerUrl: "https://example.com/cime-caron", externalUrl: "https://example.com" },
] } };
const providerResponse = { medias: [{ src: "http://data.skaping.com/station/timelapses/current.mp4", date: "2026-09-21 00:00:00", meta: { timelapse: { timelapse: { name: "daily" } } } }] };
beforeEach(() => {
  cleanup();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => providerResponse }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("WebcamsScreen", () => {
  it("bruker aldri ACTIVE_TRIP direkte", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../WebcamsScreen.tsx"), "utf8");
    expect(src).not.toMatch(/ACTIVE_TRIP/);
  });

  it("starter Station som ekte timelapse uten klikk og laster bare valgt video", async () => {
    currentTrip = vtTrip;
    const { container } = render(<WebcamsScreen />);
    const video = container.querySelector("video")!;
    await waitFor(() => expect(video.src).toBe("https://data.skaping.com/station/timelapses/current.mp4"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(video.autoplay && video.muted && video.playsInline && video.loop).toBe(true);
    expect(video.controls).toBe(false);
    expect(screen.queryByRole("button", { name: /Start avspilling/i })).toBeNull();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(VAL_THORENS_2027.webcams.length - 1);
    fireEvent.playing(video);
    fireEvent.click(screen.getByRole("button", { name: /Utvid/ }));
    expect(container.querySelector("video")).toBe(video);
    expect(screen.getAllByText(/Timelapse · 21.09.2026/).length).toBeGreaterThan(0);
  });

  it("faller ikke tilbake til Val Thorens for annen destinasjon", () => {
    currentTrip = { ...vtTrip, id: "chamonix", destination: "Chamonix", destination_config: {} };
    const { container } = render(<WebcamsScreen />);
    expect(container.querySelectorAll("iframe").length).toBe(0);
    expect(screen.getByText(/Ingen webkameraer er konfigurert/i)).toBeInTheDocument();
  });

  it("åpner og lukker storvisning i appen", () => {
    currentTrip = panoramaTrip;
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
    currentTrip = panoramaTrip;
    const { container } = render(<WebcamsScreen />);
    const original = container.querySelector("iframe");
    act(() => vi.advanceTimersByTime(20_000));
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(container.querySelector("iframe")).not.toBe(original);
    expect(screen.getByText("Åpner kamera…")).toBeInTheDocument();
  });

  it("velger nytt kamera og nullstiller feil fra forrige kamera", () => {
    currentTrip = panoramaTrip;
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

  it("melder browserblokkering ærlig uten startknapp og prøver ved canplay igjen", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue();
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "video", name: "Videokamera", externalUrl: "https://example.com", streamUrl: "https://example.com/live.mp4", mode: "video" },
    ] } };
    const { container } = render(<WebcamsScreen />);
    expect(await screen.findByText(/Nettleseren blokkerer/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start avspilling" })).toBeNull();
    fireEvent.canPlay(container.querySelector("video")!);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it("respekterer brukerens pause når siden blir synlig igjen", async () => {
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "video", name: "Video", externalUrl: "https://example.com", streamUrl: "https://example.com/live.mp4", mode: "video" },
    ] } };
    const { container } = render(<WebcamsScreen />);
    fireEvent.playing(container.querySelector("video")!);
    fireEvent.click(screen.getByRole("button", { name: "Pause video" }));
    const calls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    fireEvent(document, new Event("visibilitychange"));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole("button", { name: "Fortsett video" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(calls + 1);
  });

  it("ignorerer svar fra forrige kamera etter bytte", async () => {
    let resolveOld!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    currentTrip = { ...vtTrip, destination_config: { webcams: [
      { id: "old", name: "Old", externalUrl: "https://www.skaping.com", skapingCameraKey: "test-old", mode: "timelapse" },
      { id: "new", name: "New", externalUrl: "https://example.com", streamUrl: "https://example.com/new.mp4", mode: "video" },
    ] } };
    const { container } = render(<WebcamsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    await act(async () => { resolveOld({ ok: true, json: async () => providerResponse }); });
    expect(container.querySelector("video")?.src).toBe("https://example.com/new.mp4");
    expect(container.querySelectorAll("video")).toHaveLength(1);
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
