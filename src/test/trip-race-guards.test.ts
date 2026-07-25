/**
 * Trip-race guards — targeted unit tests for the corrective changes in this
 * job. We test pure helpers/behaviours that don't require mocking the whole
 * Supabase client: the badge LS key namespacing and the markPageSeen guard.
 *
 * The chat store's per-trip generation guards are validated indirectly by the
 * existing chat test suite; here we assert the observable public contract:
 * markPageSeen requires a tripId and namespaces localStorage per trip.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { markPageSeen } from "@/hooks/useAppBadges";

describe("markPageSeen trip-scoping", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does nothing when tripId is missing (no cross-trip leak)", () => {
    markPageSeen("polls", null);
    markPageSeen("polls", undefined);
    // No key should be written.
    expect(Object.keys(localStorage).length).toBe(0);
  });

  it("namespaces the seen key per trip", () => {
    markPageSeen("polls", "trip-A");
    markPageSeen("polls", "trip-B");
    const keys = Object.keys(localStorage);
    // Two independent keys — reading A must not silence B.
    expect(keys.some((k) => k.endsWith(":trip-A"))).toBe(true);
    expect(keys.some((k) => k.endsWith(":trip-B"))).toBe(true);
    expect(keys.length).toBe(2);
  });

  it("dispatches a badge:clear event so listeners can refresh", () => {
    const handler = vi.fn();
    window.addEventListener("badge:clear", handler);
    markPageSeen("agenda", "trip-A");
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("badge:clear", handler);
  });
});
