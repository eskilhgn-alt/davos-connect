import { describe, it, expect } from "vitest";
import { NAV_ITEMS } from "@/components/layout/BottomNavigation";

describe("BottomNavigation NAV_ITEMS", () => {
  it("har nøyaktig fire hovedfaner: Hjem, Chat, Kart, Mer", () => {
    expect(NAV_ITEMS).toHaveLength(4);
    expect(NAV_ITEMS.map((n) => n.label)).toEqual(["Hjem", "Chat", "Kart", "Mer"]);
  });

  it("peker på riktige rutepath", () => {
    expect(NAV_ITEMS.map((n) => n.path)).toEqual(["/hjem", "/chat", "/kart", "/mer"]);
  });

  it("inneholder ingen shot- eller token-flater i standardnavigasjon", () => {
    const allPaths = [
      ...NAV_ITEMS.map((n) => n.path),
      ...NAV_ITEMS.flatMap((n) => n.match ?? []),
    ].join(" ");
    expect(allPaths).not.toMatch(/shot/i);
    expect(allPaths).not.toMatch(/token/i);
  });
});
