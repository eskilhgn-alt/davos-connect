import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ fetch: vi.fn(), channels: [] as any[], removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/targetSchema", () => ({
  targetDb: { from: () => ({ select: () => ({ eq: (_key: string, trip: string) => mock.fetch(trip) }) }) },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
    removeChannel: mock.removeChannel,
    channel: () => {
      const channel = {
        events: [] as any[], status: (_status: string) => {},
        on(_type: string, filter: unknown, callback: () => void) { this.events.push({ filter, callback }); return this; },
        subscribe(callback: (status: string) => void) { this.status = callback; return this; },
      };
      mock.channels.push(channel);
      return channel;
    },
  },
}));
import { useUserLocations } from "@/hooks/useUserLocations";

const row = (trip: string, user = "member") => ({
  user_id: user, trip_id: trip, lat: 45, lon: 6, updated_at: new Date().toISOString(),
});
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(r => { resolve = r; });
  return { promise, resolve };
};
beforeEach(() => { mock.fetch.mockReset(); mock.removeChannel.mockReset(); mock.channels.length = 0; });
afterEach(cleanup);

describe("turavgrenset posisjonsvisning", () => {
  it("fjerner slettede rader ved reconnect og viser aldri en annen tur", async () => {
    mock.fetch.mockResolvedValueOnce({ data: [row("A"), row("B", "outsider")] }).mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useUserLocations("A"));
    await waitFor(() => expect(result.current.locations.map(r => r.user_id)).toEqual(["member"]));
    expect(mock.channels[0].events.map((e: any) => e.filter)).toEqual([
      { event: "INSERT", schema: "public", table: "user_locations", filter: "trip_id=eq.A" },
      { event: "UPDATE", schema: "public", table: "user_locations", filter: "trip_id=eq.A" },
    ]);
    act(() => mock.channels[0].status("SUBSCRIBED"));
    await waitFor(() => expect(result.current.locations).toEqual([]));
  });

  it("forkaster svar og hendelser fra gammel tur etter turbytte", async () => {
    const old = deferred();
    mock.fetch.mockImplementation(trip => trip === "A" ? old.promise : Promise.resolve({ data: [row("B", "new")] }));
    const { result, rerender } = renderHook(({ trip }) => useUserLocations(trip), { initialProps: { trip: "A" } });
    const previousChannel = mock.channels[0];
    rerender({ trip: "B" });
    await waitFor(() => expect(result.current.locations[0]?.user_id).toBe("new"));
    await act(async () => { old.resolve({ data: [row("A", "old")] }); await old.promise; });
    act(() => previousChannel.events[0].callback());
    expect(result.current.locations.map(r => r.trip_id)).toEqual(["B"]);
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    expect(mock.removeChannel).toHaveBeenCalledWith(previousChannel);
  });

  it("slår sammen overlappende gjenoppkoblinger til én ekstra henting", async () => {
    const pending = deferred();
    mock.fetch.mockReturnValueOnce(pending.promise).mockResolvedValue({ data: [] });
    renderHook(() => useUserLocations("A"));
    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
      mock.channels[0].status("SUBSCRIBED");
    });
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ data: [] }); await pending.promise; });
    await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(2));
  });

  it("beholder ferske posisjoner ved nettverksfeil og reparerer ved neste henting", async () => {
    mock.fetch.mockResolvedValueOnce({ data: [row("A")] })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useUserLocations("A"));
    await waitFor(() => expect(result.current.locations).toHaveLength(1));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.loading).toBe(false);
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.locations).toEqual([]));
  });

  it("avslutter lasting ved avvist forespørsel, og rydder opp ved unmount", async () => {
    mock.fetch.mockRejectedValue(new Error("offline"));
    const { result, unmount } = renderHook(() => useUserLocations("A"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    act(() => window.dispatchEvent(new Event("online")));
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("henter ingen posisjoner når ingen tur er valgt", () => {
    const { result } = renderHook(() => useUserLocations(null));
    expect(result.current).toEqual({ locations: [], loading: false });
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(mock.channels).toHaveLength(0);
  });
});
