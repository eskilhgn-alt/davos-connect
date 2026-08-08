/**
 * Reell hook-atferdstest for useValThorensLive:
 * scope A pending → scope B må starte eget fetch, og et sent A-svar må aldri
 * overskrive B sin data/loading/error. Samme scope dedupliseres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ValThorensLiveData } from "@/services/valThorensLive";

const fetchMock = vi.fn();

vi.mock("@/services/valThorensLive", async () => {
  const actual = await vi.importActual<typeof import("@/services/valThorensLive")>(
    "@/services/valThorensLive",
  );
  return {
    ...actual,
    fetchValThorensLive: (scope: string) => fetchMock(scope),
    readValThorensLiveCache: () => null,
    isValThorensCacheFresh: () => false,
  };
});

import { useValThorensLive } from "@/hooks/useValThorensLive";

function makeData(label: string): ValThorensLiveData {
  return {
    fetchedAt: new Date().toISOString(),
    updatedAtLabel: label,
    sourceUrl: "https://example.test",
    weather: [],
    totals: [],
    groups: [],
  };
}

describe("useValThorensLive scope race", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("scope B starter eget fetch selv om A er pending, og sent A-svar vinner ikke", async () => {
    let resolveA: (v: ValThorensLiveData) => void = () => {};
    const aPromise = new Promise<ValThorensLiveData>((res) => {
      resolveA = res;
    });
    fetchMock.mockImplementation((scope: string) =>
      scope === "trip:A" ? aPromise : Promise.resolve(makeData("B")),
    );

    const { result, rerender } = renderHook(({ scope }) => useValThorensLive(true, scope), {
      initialProps: { scope: "trip:A" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("trip:A"));
    expect(result.current.data).toBeNull();

    rerender({ scope: "trip:B" });

    // B starter uten manuelt refresh
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("trip:B"));
    await waitFor(() => expect(result.current.data?.updatedAtLabel).toBe("B"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      resolveA(makeData("A"));
      await aPromise;
    });

    expect(result.current.data?.updatedAtLabel).toBe("B");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("dedupliserer to refresh på samme scope", async () => {
    let resolveA: (v: ValThorensLiveData) => void = () => {};
    const aPromise = new Promise<ValThorensLiveData>((res) => {
      resolveA = res;
    });
    fetchMock.mockImplementation(() => aPromise);

    const { result } = renderHook(() => useValThorensLive(true, "trip:A"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      void result.current.refresh();
      resolveA(makeData("A"));
      await aPromise;
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.updatedAtLabel).toBe("A");
  });
});
