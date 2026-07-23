import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapScreen, OFFICIAL_PISTE_MAP_URL } from "@/pages/MapScreen";

describe("MapScreen", () => {
  it("embeds the official interactive piste map in the app", () => {
    render(<MapScreen />);

    const map = screen.getByTitle(
      "Offisielt interaktivt løypekart for Val Thorens og Les 3 Vallées",
    );
    expect(map).toBeInstanceOf(HTMLIFrameElement);
    expect(map).toHaveAttribute("src", OFFICIAL_PISTE_MAP_URL);
    expect(OFFICIAL_PISTE_MAP_URL).toBe(
      "https://lumiplay.link/interactive-map/les-3-vallees/fr",
    );
  });
});
