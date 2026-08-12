/**
 * UI-atferd for ShotScreen: live-region for skjermleser, respekt for
 * reduced motion, og at statistikken viser alle fem nøkkeltall per bruker.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const shotState = {
  tripId: "trip-1",
  isArchive: false,
  isLoading: false,
  isStarting: false,
  draw: {
    id: "draw-1",
    trip_id: "trip-1",
    initiated_by: "u1",
    status: "countdown" as const,
    server_started_at: "2026-08-11T10:00:00.000Z",
    draw_at: "2026-08-11T10:00:10.000Z",
    finalized_at: null,
    participant_count: 9,
    participant_hash: "h",
    seed_commitment: "c",
    seed_reveal: null,
    winner_id: null,
    proof_counter: null,
    proof_value: null,
    algorithm_version: "sha256-rejection-v1",
    created_at: "2026-08-11T10:00:00.000Z",
  },
  participants: [{ user_id: "u1", position: 0 }],
  remainingMs: 7000,
  history: [],
  stats: [
    {
      user_id: "u1",
      times_in: 10,
      times_drawn: 2,
      expected_draws: 1.5,
      last_drawn_at: "2026-08-10T20:00:00.000Z",
    },
  ],
  start: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("@/hooks/useShotDraw", () => ({ useShotDraw: () => shotState }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/components/layout/AppHeader", () => ({
  AppHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/layout/BackButton", () => ({ BackButton: () => <button>Tilbake</button> }));
vi.mock("@/components/PullToRefreshWrapper", () => ({
  PullToRefreshWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
  },
}));

import ShotScreen from "@/pages/ShotScreen";

describe("ShotScreen – tilgjengelighet og statistikk", () => {
  it("annonserer nedtellingen i en polite live-region", () => {
    render(<ShotScreen />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live?.textContent).toMatch(/Trekning om 7 sekunder/);
  });

  it("deaktiverer animasjon ved redusert bevegelse", () => {
    render(<ShotScreen />);
    const reduced = document.querySelectorAll("[class*='motion-reduce:']");
    expect(reduced.length).toBeGreaterThan(0);
  });

  it("viser med, trukket, faktisk andel, forventet andel og sist trukket", () => {
    render(<ShotScreen />);
    expect(screen.getByText("Med")).toBeTruthy();
    expect(screen.getByText("Trukket")).toBeTruthy();
    expect(screen.getByText("Faktisk andel")).toBeTruthy();
    expect(screen.getByText("Forventet andel")).toBeTruthy();
    expect(screen.getByText("Sist trukket")).toBeTruthy();
    expect(screen.getByText("20.0 %")).toBeTruthy(); // 2/10
    expect(screen.getByText("15.0 %")).toBeTruthy(); // 1.5/10
  });
});
