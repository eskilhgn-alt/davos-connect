import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapScreen, OFFICIAL_PISTE_MAP_URL } from "@/pages/MapScreen";
import type { Trip } from "@/hooks/useActiveTrip";

const vt: Trip = {
  id: "t-vt",
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

let selected: Trip | null = vt;

vi.mock("@/contexts/TripContext", () => ({
  useTrip: () => ({
    selectedTrip: selected,
    selectedTripId: selected?.id ?? null,
    trips: [],
    activeTrip: selected,
    isArchive: false,
    isLoading: false,
    selectTrip: async () => {},
    refreshTrip: async () => {},
  }),
}));

describe("MapScreen", () => {
  it("embeds the official interactive piste map for Val Thorens", () => {
    selected = vt;
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

  it("gir aldri Val Thorens-kart eller live status til en annen destinasjon", () => {
    selected = { ...vt, id: "t-hemsedal", destination: "Hemsedal", destination_config: {} };
    const { container } = render(<MapScreen />);

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("Løypekart er ikke konfigurert")).toBeTruthy();
    expect(screen.queryByText("Live status")).toBeNull();
  });

  it("bruker turens eget kart fra destination_config", () => {
    selected = {
      ...vt,
      id: "t-other",
      destination: "Hemsedal",
      destination_config: { pisteMap: { url: "https://example.com/kart", title: "Hemsedal kart" } },
    };
    render(<MapScreen />);
    expect(screen.getByTitle("Hemsedal kart")).toHaveAttribute("src", "https://example.com/kart");
  });
});
