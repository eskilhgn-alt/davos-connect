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

  it("har ingen egen shot- eller token-fane i hovedmenyen", () => {
    const tabPaths = NAV_ITEMS.map((n) => n.path).join(" ");
    expect(tabPaths).not.toMatch(/shot/i);
    expect(tabPaths).not.toMatch(/token/i);
  });
});
