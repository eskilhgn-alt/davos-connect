import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const counts = { listMount: 0, listUnmount: 0, compMount: 0, compUnmount: 0 };
let archive = false;
vi.mock("@/chat/useVisualViewport", () => ({ useVisualViewport: () => ({ vvh: 800, kb: 0 }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: null, isAdmin: false }) }));
vi.mock("@/contexts/TripContext", () => ({ useTrip: () => ({ selectedTripId: "t1", selectedTrip: { name: "VT" }, isArchive: archive }) }));
vi.mock("@/services/onesignal", () => ({ oneSignalService: { init: vi.fn(() => Promise.resolve()) } }));
vi.mock("@/chat/store", () => ({ chatStore: { setTrip: vi.fn(), subscribeToMessages: () => () => {}, subscribeToTyping: () => () => {} } }));
vi.mock("@/chat/MessageList", () => ({
  MessageList: () => {
    React.useEffect(() => { counts.listMount++; return () => { counts.listUnmount++; }; }, []);
    return <div data-testid="message-list" />;
  },
}));
vi.mock("@/chat/Composer", () => ({
  Composer: () => {
    React.useEffect(() => { counts.compMount++; return () => { counts.compUnmount++; }; }, []);
    return <textarea aria-label="Melding" />;
  },
}));
vi.mock("@/pages/StoriesScreen", () => ({ default: () => <button>Ny story</button> }));
vi.mock("@/pages/GalleryScreen", () => ({ default: () => <div>Minner-innhold</div> }));

import { ChatScreen } from "@/chat/ChatScreen";
import { LegacyMediaRedirect } from "@/features/chatmedia/LegacyMediaRedirect";

afterEach(() => { cleanup(); archive = false; Object.keys(counts).forEach((k) => ((counts as Record<string, number>)[k] = 0)); });

const renderChat = (url = "/chat") =>
  render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/chat" element={<ChatScreen />} /></Routes></MemoryRouter>);

describe("CHAT-MEDIA-01 paneler", () => {
  it("bytte faner avmonterer ikke MessageList/Composer; draft beholdes, lag inert og fokus slippes", async () => {
    renderChat();
    const input = screen.getByLabelText("Melding") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "utkast" } });
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByRole("tab", { name: /Stories/ }));
    expect(await screen.findByText("Ny story")).toBeInTheDocument();
    const layer = screen.getByTestId("chat-composer-layer");
    expect(layer).toHaveAttribute("hidden");
    expect(layer).toHaveAttribute("inert");
    expect(screen.getByTestId("chat-message-layer")).toHaveAttribute("inert");
    expect(document.activeElement).not.toBe(input);

    fireEvent.click(screen.getByRole("tab", { name: /Minner/ }));
    expect(await screen.findByText("Minner-innhold")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Meldinger/ }));

    await waitFor(() => expect(screen.queryByRole("tabpanel")).toBeNull());
    expect(screen.getByLabelText("Melding")).toBe(input);
    expect(input.value).toBe("utkast");
    expect(layer).not.toHaveAttribute("inert");
    expect(counts).toEqual({ listMount: 1, listUnmount: 0, compMount: 1, compUnmount: 0 });
  });

  it("mediepanel er synlig; arkivbanner ligger ikke over panelet og composer finnes ikke i arkiv", async () => {
    archive = true;
    renderChat("/chat?panel=minner");
    expect(await screen.findByText("Minner-innhold")).toBeVisible();
    expect(screen.queryByLabelText("Melding")).toBeNull();
    expect(screen.queryByRole("status", { name: /Arkiv/ })).toBeNull();
  });

  it("legacy /historier bevarer story-deeplink til Chat Stories", async () => {
    render(<MemoryRouter initialEntries={["/historier?story=abc"]}><Routes>
      <Route path="/historier" element={<LegacyMediaRedirect panel="stories" />} />
      <Route path="/chat" element={<ChatScreen />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText("Ny story")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Stories/ })).toHaveAttribute("aria-selected", "true");
  });
});
