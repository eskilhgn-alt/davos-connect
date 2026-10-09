import { describe, it, expect } from "vitest";
import { chatPanelHref } from "@/features/chatmedia/LegacyMediaRedirect";

describe("CHAT-MEDIA-01 legacy redirects", () => {
  it("galleri -> minner panel", () => {
    expect(chatPanelHref("minner", "")).toBe("/chat?panel=minner");
  });
  it("historier preserves story deep link", () => {
    expect(chatPanelHref("stories", "?story=abc")).toBe("/chat?panel=stories&story=abc");
  });
  it("story param ignored for minner", () => {
    expect(chatPanelHref("minner", "?story=abc")).toBe("/chat?panel=minner");
  });
});
