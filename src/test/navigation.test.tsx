import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppLayout } from "@/components/layout/AppLayout";

vi.mock("@/components/layout/PopupAnnouncement", () => ({ PopupAnnouncementOverlay: () => null }));
vi.mock("@/components/onboarding/PermissionPrompt", () => ({ PermissionPrompt: () => null }));
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
    render(<MemoryRouter><AppHeader title="Dialog" leftAction={<button onClick={onClose}>Lukk</button>} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Lukk" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
