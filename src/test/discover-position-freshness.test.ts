/**
 * Beviser at Oppdag-avstand bruker den FAKTISKE måletiden, ikke rendertid.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { personalDistanceMeters } from "@/features/discover/distance";
import { STALE_LOCATION_MS } from "@/hooks/useUserLocations";

const target = { lat: 45.3, lon: 6.58 };

describe("posisjonens måletidspunkt", () => {
  it("rerender med samme posisjon fornyer ikke ferskheten", () => {
    const measuredAt = Date.now() - (STALE_LOCATION_MS + 60_000);
    const own = { enabled: true, position: { lat: 45.299, lon: 6.58 }, updatedAt: measuredAt };
    // Flere «renders» — samme objekt, samme (gamle) måletid.
    expect(personalDistanceMeters(own, target)).toBeNull();
    expect(personalDistanceMeters(own, target, Date.now() + 1000)).toBeNull();
  });

  it("gir avstand kun når målingen faktisk er fersk", () => {
    const now = Date.UTC(2027, 1, 10, 12, 0, 0);
    expect(
      personalDistanceMeters(
        { enabled: true, position: { lat: 45.299, lon: 6.58 }, updatedAt: now - 1000 },
        target,
        now,
      ),
    ).toBeGreaterThan(0);
    expect(
      personalDistanceMeters(
        { enabled: true, position: { lat: 45.299, lon: 6.58 }, updatedAt: now - STALE_LOCATION_MS },
        target,
        now,
      ),
    ).toBeNull();
  });

  it("nulles når posisjonen fjernes", () => {
    expect(personalDistanceMeters({ enabled: true, position: null, updatedAt: null }, target)).toBeNull();
  });
});

describe("kilde til måletidspunkt", () => {
  const ctx = fs.readFileSync(
    path.resolve(__dirname, "../contexts/LocationSharingContext.tsx"),
    "utf8",
  );
  const screen = fs.readFileSync(path.resolve(__dirname, "../pages/DiscoverScreen.tsx"), "utf8");

  it("leser GeolocationPosition.timestamp fra den faktiske målingen", () => {
    expect(ctx).toContain("geo.timestamp");
    expect(ctx).toContain("positionUpdatedAt: position ? position.timestamp : null");
  });

  it("Oppdag setter aldri updatedAt = Date.now() ved render", () => {
    expect(screen).toContain("updatedAt: positionUpdatedAt");
    expect(screen).not.toMatch(/updatedAt:\s*(position\s*\?\s*)?Date\.now\(\)/);
  });
});
