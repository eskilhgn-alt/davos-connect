import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatScreen } from "@/chat/ChatScreen";

vi.mock("@/components/layout/PopupAnnouncement", () => ({ PopupAnnouncementOverlay: () => null }));
vi.mock("@/components/onboarding/PermissionPrompt", () => ({ PermissionPrompt: () => null }));
vi.mock("@/chat/useVisualViewport", () => ({ useVisualViewport: () => ({ vvh: 800, kb: 0 }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, profile: null }) }));
vi.mock("@/contexts/TripContext", () => ({ useTrip: () => ({ selectedTripId: null, selectedTrip: null, isArchive: false }) }));
vi.mock("@/services/onesignal", () => ({ oneSignalService: { init: vi.fn() } }));
vi.mock("@/chat/store", () => ({ chatStore: { setTrip: vi.fn() } }));
vi.mock("@/chat/MessageList", () => ({ MessageList: () => null }));
vi.mock("@/chat/Composer", () => ({ Composer: () => null }));
afterEach(cleanup);

describe("Felles navigasjon hjem", () => {
  it("går alltid hjem selv når forrige side var Mer, uten noen bunnmeny", () => {
    render(<MemoryRouter initialEntries={["/mer", "/kart"]}>
      <Routes><Route element={<AppLayout />}>
        <Route path="/kart" element={<AppHeader title="Kart" />} />
        <Route path="/hjem" element={<AppHeader title="GüttaHütte" />} />
        <Route path="/mer" element={<AppHeader title="Mer" />} />
      </Route></Routes>
    </MemoryRouter>);
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tilbake til hjem" }));
    expect(screen.getByRole("heading", { name: /GüttaHütte/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tilbake til hjem" })).toBeNull();
  });

  it("viser hjem-pil også når en underside åpnes direkte", () => {
    render(<MemoryRouter initialEntries={["/innstillinger"]}><AppHeader title="Innstillinger" /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Tilbake til hjem" })).toBeInTheDocument();
  });

  it("beholder egne lukkeknapper for dialoger", () => {
    const onClose = vi.fn();
    render(<MemoryRouter initialEntries={["/webcams"]}><AppHeader title="Dialog" rightAction={<button onClick={onClose}>Lukk</button>} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("button", { name: "Tilbake til hjem" })).toHaveLength(1);
  });

  it("har én hjem-pil i chatten også uten valgt tur, og navigerer hjem", () => {
    render(<MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route path="/chat" element={<ChatScreen />} />
        <Route path="/hjem" element={<AppHeader title="GüttaHütte" />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getAllByRole("button", { name: "Tilbake til hjem" })).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tilbake til hjem" }));
    expect(screen.getByRole("heading", { name: /GüttaHütte/ })).toBeInTheDocument();
  });

  it("viser samme hjem-pil på feilsiden selv om ruteren har krasjet", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const BrokenScreen = (): never => { throw new Error("test crash"); };
    try {
      render(<ErrorBoundary><BrokenScreen /></ErrorBoundary>);
      expect(screen.getAllByRole("button", { name: "Tilbake til hjem" })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Last inn på nytt" })).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});
