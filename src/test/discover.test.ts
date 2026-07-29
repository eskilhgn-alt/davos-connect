import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { guttaMatch, sortByGuttaMatch } from "@/features/discover/guttaMatch";
import {
  personalDistanceMeters,
  formatDistance,
  DISTANCE_UNAVAILABLE_TEXT,
} from "@/features/discover/distance";
import { isDiscoverCategory } from "@/features/discover/types";
import type { DiscoverPlace } from "@/features/discover/types";

const place = (over: Partial<DiscoverPlace>): DiscoverPlace => ({
  id: "google:a",
  name: "A",
  category: "spise",
  lat: 45.297,
  lon: 6.58,
  address: null,
  rating: 4.6,
  ratingCount: 400,
  priceLevel: 2,
  openNow: true,
  photoUrl: null,
  providerUrl: null,
  ...over,
});

describe("Gütta-match", () => {
  it("er deterministisk og uavhengig av brukerposisjon", () => {
    const p = place({});
    expect(guttaMatch(p)).toEqual(guttaMatch(p));
    expect(JSON.stringify(guttaMatch(p))).not.toContain("avstand");
  });

  it("gir samme rekkefølge uansett hvem som ser listen", () => {
    const list = [
      place({ id: "google:b", rating: 3.6, ratingCount: 20 }),
      place({ id: "google:a", rating: 4.8, ratingCount: 900 }),
      place({ id: "google:c", rating: 4.3, ratingCount: 120 }),
    ];
    const order = sortByGuttaMatch(list).map((p) => p.id);
    expect(order).toEqual(["google:a", "google:c", "google:b"]);
    expect(sortByGuttaMatch([...list].reverse()).map((p) => p.id)).toEqual(order);
  });

  it("forklarer signalene konkret", () => {
    const m = guttaMatch(place({}));
    expect(m.reasons).toContain("svært godt vurdert av mange");
    expect(m.reasons).toContain("åpent nå");
  });

  it("markerer få vurderinger som usikkert", () => {
    expect(guttaMatch(place({ rating: 5, ratingCount: 2 })).reasons).toContain(
      "få vurderinger – usikkert",
    );
  });
});

describe("personlig avstand", () => {
  const target = { lat: 45.3, lon: 6.58 };
  const now = Date.UTC(2027, 1, 10, 12, 0, 0);

  it("varierer med brukerens egen posisjon", () => {
    const near = personalDistanceMeters(
      { enabled: true, position: { lat: 45.299, lon: 6.58 }, updatedAt: now - 5000 },
      target,
      now,
    );
    const far = personalDistanceMeters(
      { enabled: true, position: { lat: 45.35, lon: 6.58 }, updatedAt: now - 5000 },
      target,
      now,
    );
    expect(near!).toBeLessThan(far!);
  });

  it("gir ingen oppdiktet avstand når deling er av", () => {
    expect(
      personalDistanceMeters({ enabled: false, position: target, updatedAt: now }, target, now),
    ).toBeNull();
  });

  it("gir ingen avstand ved stale posisjon", () => {
    expect(
      personalDistanceMeters(
        { enabled: true, position: target, updatedAt: now - 11 * 60_000 },
        target,
        now,
      ),
    ).toBeNull();
  });

  it("viser ærlig tekst istedenfor tall", () => {
    expect(formatDistance(null)).toBe(DISTANCE_UNAVAILABLE_TEXT);
    expect(formatDistance(120)).toBe("120 m");
  });
});

describe("kontrakt og edge function", () => {
  const fnSrc = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/discover-places/index.ts"),
    "utf8",
  );
  const hookSrc = fs.readFileSync(
    path.resolve(__dirname, "../features/discover/useDiscover.ts"),
    "utf8",
  );

  it("validerer kategori", () => {
    expect(isDiscoverCategory("spise")).toBe(true);
    expect(isDiscoverCategory("casino")).toBe(false);
    expect(fnSrc).toContain('return json({ error: "invalid_category" }, 400)');
  });

  it("krever godkjent medlem og turmedlemskap", () => {
    expect(fnSrc).toContain("requireApprovedMember");
    expect(fnSrc).toContain('"not_trip_member"');
  });

  it("leser senter server-side og godtar aldri klientkoordinater", () => {
    expect(fnSrc).toContain("destination_config");
    expect(fnSrc).not.toMatch(/body\??\.(lat|lon|latitude|longitude|radius|center)/);
    expect(hookSrc).not.toMatch(/body: \{[^}]*lat/);
  });

  it("har timeout, rate limit og stram FieldMask", () => {
    expect(fnSrc).toContain("AbortController");
    expect(fnSrc).toContain("rate_limited");
    expect(fnSrc).toContain("X-Goog-FieldMask");
  });

  it("bruker riktig secret-navn og lekker den aldri i svaret", () => {
    expect(fnSrc).toContain('Deno.env.get("GOOGLE_PLACES_API_KEY")');
    expect(fnSrc).not.toMatch(/console\.log\([^)]*apiKey/);
  });

  it("returnerer Google-attribution", () => {
    expect(fnSrc).toContain("Stedsdata fra Google Maps");
  });

  it("forkaster resultat fra forrige tur (generation guard)", () => {
    expect(hookSrc).toContain("gen !== generation.current");
    expect(hookSrc).toContain("payload.tripId !== selectedTripId");
  });

  it("har ingen falske demoanbefalinger i runtime", () => {
    expect(hookSrc).not.toMatch(/DEMO|mockPlaces|fakePlaces/i);
  });
});

describe("Oppdag-flis og rute", () => {
  it("er registrert i App og Mer", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");
    const more = fs.readFileSync(path.resolve(__dirname, "../pages/MoreScreen.tsx"), "utf8");
    expect(app).toContain('path="/oppdag"');
    expect(app).toContain("DiscoverScreen");
    expect(more).toContain('to: "/oppdag"');
  });

  it("gir ikke andre destinasjoner Val Thorens-data", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../pages/DiscoverScreen.tsx"), "utf8");
    expect(screen).not.toMatch(/VAL_THORENS|Val Thorens/);
    const fnSrc = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/discover-places/index.ts"),
      "utf8",
    );
    expect(fnSrc).not.toMatch(/VAL_THORENS|Val Thorens/);
  });
});
