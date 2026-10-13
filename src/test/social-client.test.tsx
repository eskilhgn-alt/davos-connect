import * as React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act as reactAct,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const mocks = vi.hoisted(() => ({
  trip: "trip-a",
  state: vi.fn(),
  history: vi.fn(),
  event: vi.fn(),
  command: vi.fn(),
  channel: vi.fn(),
  remove: vi.fn(),
  selectTrip: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-a" } }),
}));
vi.mock("@/contexts/TripContext", () => ({
  useTrip: () => ({
    selectedTripId: mocks.trip,
    selectTrip: mocks.selectTrip,
    trips: [{ id: "trip-a" }, { id: "trip-b" }],
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.remove },
}));
vi.mock("@/features/social/api", () => ({
  socialApi: {
    state: mocks.state,
    history: mocks.history,
    event: mocks.event,
    command: mocks.command,
  },
  socialError: (e: Error) => e.message,
}));
import { SocialProvider, useSocial } from "@/features/social/SocialProvider";
import {
  EventFocus,
  useSocialHistory,
  OlderHistory,
} from "@/features/social/history";
import VibeScreen from "@/pages/VibeScreen";
const data = (trip = "trip-a") => ({
  trip_id: trip,
  server_now: new Date().toISOString(),
  trip_day: "2026-10-14",
  writable: true,
  starts_today: 0,
  members: [],
  events: [],
  notifications: [],
  active_vibe: null,
  draws: [],
  participants: [],
  rights: [],
  stats: [],
});
function Probe() {
  const c = useSocial();
  return (
    <>
      <span data-testid="trip">{c.state?.trip_id ?? "none"}</span>
      <button
        onClick={() => {
          void c.act({ action: "shot_start" });
          void c.act({ action: "shot_start" });
        }}
      >
        Twice
      </button>
      <p>{c.error}</p>
    </>
  );
}
const tree = (children: React.ReactNode = <Probe />, entry = "/") => (
  <MemoryRouter initialEntries={[entry]}>
    <SocialProvider>{children}</SocialProvider>
  </MemoryRouter>
);
beforeEach(() => {
  mocks.trip = "trip-a";
  mocks.history.mockReset().mockResolvedValue({ items: [], cursor: null });
  mocks.event.mockReset();
  mocks.state
    .mockReset()
    .mockImplementation(async (trip: string) => data(trip));
  mocks.command.mockReset().mockResolvedValue({ id: "id", committed: true });
  mocks.selectTrip.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset();
  mocks.channel.mockReset().mockImplementation(() => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    };
    return channel;
  });
  sessionStorage.clear();
});
afterEach(cleanup);
describe("social client transaction and trip handling", () => {
  it("double click sends once; timeout retry retains idempotency key", async () => {
    mocks.command.mockRejectedValueOnce(new Error("timeout"));
    render(tree());
    await screen.findByText("trip-a");
    fireEvent.click(screen.getByText("Twice"));
    await screen.findByText("timeout");
    expect(mocks.command).toHaveBeenCalledTimes(1);
    const key = mocks.command.mock.calls[0][1];
    fireEvent.click(screen.getByText("Twice"));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2));
    expect(mocks.command.mock.calls[1][1]).toBe(key);
  });
  it("retains retry key across remount after uncertain response", async () => {
    mocks.command.mockRejectedValue(new Error("timeout"));
    const view = render(tree());
    await screen.findByText("trip-a");
    fireEvent.click(screen.getByText("Twice"));
    await screen.findByText("timeout");
    const key = mocks.command.mock.calls[0][1];
    view.unmount();
    render(tree());
    await screen.findByText("trip-a");
    fireEvent.click(screen.getByText("Twice"));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(2));
    expect(mocks.command.mock.calls[1][1]).toBe(key);
  });
  it("late result from previous trip cannot overwrite new trip", async () => {
    let resolve!: (v: unknown) => void;
    mocks.state.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(tree());
    mocks.trip = "trip-b";
    view.rerender(tree());
    await screen.findByText("trip-b");
    await reactAct(async () => resolve(data("trip-a")));
    expect(screen.getByTestId("trip").textContent).toBe("trip-b");
  });
  it("one channel for four tables, removed on unmount", async () => {
    const view = render(tree());
    await screen.findByText("trip-a");
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.mock.results[0].value.on).toHaveBeenCalledTimes(4);
    view.unmount();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("deep link only selects a known authorized trip and only once", async () => {
    const view = render(tree(<Probe />, "/?trip=trip-b"));
    await waitFor(() =>
      expect(mocks.selectTrip).toHaveBeenCalledWith("trip-b"),
    );
    mocks.trip = "trip-b";
    view.rerender(tree(<Probe />, "/?trip=trip-b"));
    await screen.findByText("trip-b");
    mocks.trip = "trip-a";
    view.rerender(tree(<Probe />, "/?trip=trip-b"));
    await screen.findByText("trip-a");
    expect(mocks.selectTrip).toHaveBeenCalledTimes(1);
  });
  it("vibe button stays while pending and disappears only on server state", async () => {
    let resolve!: (v: unknown) => void;
    mocks.command.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(tree(<VibeScreen />));
    const button = await screen.findByRole("button", { name: "God stemning" });
    fireEvent.change(screen.getByLabelText("Hvor? (valgfritt)"), {
      target: { value: "Hytta" },
    });
    fireEvent.click(button);
    expect(
      await screen.findByRole("button", { name: "Sender …" }),
    ).toBeDisabled();
    mocks.state.mockResolvedValue({
      ...data(),
      active_vibe: { id: "vibe", body: "God stemning ved hytta" },
    });
    await reactAct(async () => resolve({ id: "vibe", committed: true }));
    await screen.findByText("God stemning ved hytta");
    expect(screen.queryByRole("button", { name: "God stemning" })).toBeNull();
  });
  it("archived state has history and no mutation button", async () => {
    mocks.state.mockResolvedValue({ ...data(), writable: false });
    render(tree(<VibeScreen />));
    await screen.findByText(
      "Turen er skrivebeskyttet. Du kan lese historikken.",
    );
    expect(screen.queryByRole("button", { name: "God stemning" })).toBeNull();
  });
});

describe("social durable history", () => {
  it("opens a specific old event outside the latest snapshot", async () => {
    mocks.event.mockResolvedValue({
      event: {
        id: "old",
        title: "God stemning",
        body: "Historisk hendelse",
        created_at: new Date().toISOString(),
      },
      draw: null,
    });
    render(tree(<EventFocus />, "/stemning?trip=trip-a&event=old"));
    await screen.findByText("Historisk hendelse");
    expect(mocks.event).toHaveBeenCalledWith("trip-a", "old");
  });
  it("does not fetch an event on the wrong trip", async () => {
    render(tree(<EventFocus />, "/shot?trip=unknown&event=old"));
    await waitFor(() => expect(mocks.state).toHaveBeenCalled());
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("pages older history and rejects a late page after a trip switch", async () => {
    let finish!: (v: unknown) => void;
    const cursor = { before: "2026-01-01T00:00:00Z", id: "one" };
    mocks.history
      .mockResolvedValueOnce({
        items: [{ id: "one", created_at: cursor.before }],
        cursor,
      })
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue({ items: [], cursor: null });
    function History() {
      const h = useSocialHistory<{ id: string }>("vibe", []);
      return (
        <>
          {h.items.map((x) => (
            <p key={x.id}>{x.id}</p>
          ))}
          <OlderHistory history={h} />
        </>
      );
    }
    const view = render(tree(<History />));
    await screen.findByText("one");
    fireEvent.click(screen.getByText("Vis eldre"));
    await waitFor(() =>
      expect(mocks.history).toHaveBeenCalledWith("trip-a", "vibe", cursor),
    );
    mocks.trip = "trip-b";
    view.rerender(tree(<History />));
    await waitFor(() =>
      expect(mocks.history).toHaveBeenCalledWith("trip-b", "vibe", null),
    );
    await reactAct(async () =>
      finish({ items: [{ id: "old-secret" }], cursor: null }),
    );
    expect(screen.queryByText("old-secret")).toBeNull();
  });
});
