import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";

vi.mock("@/utils/haptics", () => ({ hapticMedium: vi.fn(), hapticSuccess: vi.fn() }));
afterEach(cleanup);

function setup(refresh = vi.fn(async () => {})) {
  const view = render(<PullToRefreshWrapper onRefresh={refresh}><span>Innhold</span></PullToRefreshWrapper>);
  return { node: view.container.firstElementChild as HTMLElement, refresh };
}
function start(node: HTMLElement) {
  fireEvent.touchStart(node, { touches: [{ clientX: 10, clientY: 100 }] });
}
function move(node: HTMLElement, dy: number, dx = 0) {
  const event = createEvent.touchMove(node, { touches: [{ clientX: 10 + dx, clientY: 100 + dy }], cancelable: true });
  fireEvent(node, event);
  return event;
}
async function end(node: HTMLElement) {
  await act(async () => { fireEvent.touchEnd(node, { touches: [] }); });
}

describe("Dra ned for å oppdatere", () => {
  it("oppdaterer med et normalt drag på 170px, uten å remounte innholdet", async () => {
    const { node, refresh } = setup();
    const content = screen.getByText("Innhold");
    start(node);
    expect(move(node, 170).defaultPrevented).toBe(true);
    await end(node);
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Innhold")).toBe(content);
    expect(node).toHaveAttribute("aria-busy", "false");
  });

  it("godtar Safaris negative scrollTop ved toppen", async () => {
    const { node, refresh } = setup();
    node.scrollTop = -3;
    start(node); move(node, 170); await end(node);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("avviser drag som startet lenger ned selv om man når toppen", async () => {
    const { node, refresh } = setup();
    node.scrollTop = 100;
    start(node);
    node.scrollTop = 0;
    expect(move(node, 200).defaultPrevented).toBe(false);
    await end(node);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([[70, 0], [-170, 0], [170, 220]])("oppdaterer ikke ved kort/oppover/sidelengs drag (%s,%s)", async (dy, dx) => {
    const { node, refresh } = setup();
    start(node); move(node, dy, dx); await end(node);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("avbryter når fingeren trekkes tilbake før man slipper", async () => {
    const { node, refresh } = setup();
    start(node); move(node, 180); move(node, 10); await end(node);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("touchcancel utløser aldri oppdatering og neste drag virker", async () => {
    const { node, refresh } = setup();
    start(node); move(node, 200); fireEvent.touchCancel(node); await end(node);
    expect(refresh).not.toHaveBeenCalled();
    start(node); move(node, 180); await end(node);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("avbryter når en ekstra finger kommer til", async () => {
    const { node, refresh } = setup();
    start(node); move(node, 200);
    fireEvent.touchMove(node, { touches: [{ clientX: 10, clientY: 300 }, { clientX: 20, clientY: 300 }] });
    await end(node);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("viser fremdrift og tillater bare én oppdatering om gangen", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { node } = setup(refresh);
    start(node); move(node, 180); await end(node);
    expect(screen.getByRole("status")).toHaveTextContent("Oppdaterer");
    start(node); move(node, 200); await end(node);
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => { finish(); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("viser feil og lar brukeren prøve igjen uten en fastlåst spinner", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const { node } = setup(refresh);
    start(node); move(node, 180); await end(node);
    expect(screen.getByRole("alert")).toHaveTextContent("Kunne ikke oppdatere");
    start(node); move(node, 180); await end(node);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(node).toHaveAttribute("aria-busy", "false");
  });
});
