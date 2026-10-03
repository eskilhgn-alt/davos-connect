import { describe, expect, it } from "vitest";
import { parseTimelapseResponse, timelapseCaption } from "../skapingTimelapse";

describe("Skaping timelapse source", () => {
  it("uses the newest dated playable record and upgrades provider HTTP to HTTPS", () => {
    const clip = parseTimelapseResponse({ medias: [
      { src: "https://skaping.s3.gra.io.cloud.ovh.net/weekly.mp4", date: "2026-09-14 00:00:00" },
      { src: "http://data.skaping.com/today.mp4", date: "2026-09-21 00:00:00", meta: { timelapse: { timelapse: { name: "daily" } } } },
    ] });
    expect(clip).toEqual({ src: "https://data.skaping.com/today.mp4", date: "2026-09-21", period: "daily" });
  });

  it.each([null, {}, { medias: [] }, { medias: [null] }, { medias: [{ src: "https://evil.test/live.mp4", date: "2026-09-21 00:00:00" }] }, { medias: [{ src: "https://data.skaping.com/player.html", date: "2026-09-21 00:00:00" }] }])("rejects missing video and unverified media origins: %j", value => {
    expect(() => parseTimelapseResponse(value)).toThrow("Ingen tilgjengelig timelapse");
  });

  it("keeps old recordings visibly dated and describes weekly footage accurately", () => {
    expect(timelapseCaption({ src: "https://data.skaping.com/old.mp4", date: "2026-05-04", period: "weekly" })).toBe("Timelapse · uke fra 04.05.2026");
  });
});
