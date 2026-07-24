import { describe, it, expect } from "vitest";
import {
  buildStoryCacheKey,
  storyChannelName,
  storyChannelFilter,
  canWriteStory,
  filterStoriesForTrip,
} from "@/features/stories/tripScoping";

describe("stories trip scoping", () => {
  it("cache key is per (user, trip)", () => {
    expect(buildStoryCacheKey("u1", "tA")).toBe("guttahutte:stories:u1:tA:v2");
    expect(buildStoryCacheKey("u1", "tA")).not.toBe(buildStoryCacheKey("u1", "tB"));
  });

  it("realtime channel + filter are trip-scoped", () => {
    expect(storyChannelName("tA")).toBe("stories-rt:tA");
    expect(storyChannelFilter("tA")).toBe("trip_id=eq.tA");
  });

  it("blocks writes in archive or when no trip selected", () => {
    expect(canWriteStory({ tripId: "tA", isArchive: false })).toBe(true);
    expect(canWriteStory({ tripId: "tA", isArchive: true })).toBe(false);
    expect(canWriteStory({ tripId: null, isArchive: false })).toBe(false);
  });

  it("filterStoriesForTrip only returns rows tagged to the selected trip", () => {
    const rows = [
      { id: "1", trip_id: "tA" },
      { id: "2", trip_id: "tB" },
      { id: "3", trip_id: "tA" },
      { id: "4", trip_id: null },
    ];
    expect(filterStoriesForTrip(rows, "tA").map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterStoriesForTrip(rows, "tB").map((r) => r.id)).toEqual(["2"]);
    expect(filterStoriesForTrip(rows, null)).toEqual([]);
  });
});
