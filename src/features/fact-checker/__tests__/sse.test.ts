import { describe, expect, it } from "vitest";
import { parseSseJson, takeSseFrames } from "@/features/fact-checker/sse";

describe("takeSseFrames", () => {
  it("beholder en uferdig ramme til neste chunk", () => {
    const first = takeSseFrames('event: stage\ndata: {"stage":"search');
    expect(first.events).toEqual([]);

    const second = takeSseFrames(`${first.rest}ing"}\n\nevent: done\ndata: {}\n\n`);
    expect(second.events).toEqual([
      { event: "stage", data: '{"stage":"searching"}' },
      { event: "done", data: "{}" },
    ]);
    expect(second.rest).toBe("");
  });

  it("støtter CRLF og flere data-linjer", () => {
    const result = takeSseFrames("event: final\r\ndata: {\"a\":\r\ndata: 1}\r\n\r\n");
    expect(result.events).toEqual([{ event: "final", data: '{"a":\n1}' }]);
  });

  it("returnerer null for ugyldig JSON", () => {
    expect(parseSseJson("{")).toBeNull();
    expect(parseSseJson<{ ok: boolean }>("{\"ok\":true}")).toEqual({ ok: true });
  });
});
