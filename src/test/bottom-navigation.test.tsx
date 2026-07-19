import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNavigation } from "@/components/layout/BottomNavigation";

// Enkel isolert test: bunn-navigasjonen skal alltid vise de fire hovedfanene
// og markere korrekt fane basert på ruten.

vi.mock("@/hooks/useAppBadges", () => ({
  useAppBadges: () => ({ chat: 0, stories: 0, polls: 0, shot: 0, agenda: 0, runder: 0 }),
}));

describe("BottomNavigation", () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <BottomNavigation />
      </MemoryRouter>
    );

  it("viser fire hovedfaner", () => {
    renderAt("/hjem");
    expect(screen.getByRole("link", { name: /hjem/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /kart/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mer/i })).toBeInTheDocument();
  });

  it("markerer Kart-fanen som aktiv både på /kart og /crew", () => {
    for (const path of ["/kart", "/crew", "/magnus"]) {
      const { unmount } = renderAt(path);
      const kart = screen.getByRole("link", { name: /kart/i });
      expect(kart.getAttribute("aria-current")).toBe("page");
      unmount();
    }
  });
});
