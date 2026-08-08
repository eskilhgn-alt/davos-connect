/**
 * TripContext.applySavedTrip: en verifisert trips-rad må aldri alene gi
 * runtime-tilgang (valgt tur) uten fersk medlemskap i trip_members.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("src/contexts/TripContext.tsx", "utf8");

describe("applySavedTrip membership hardening", () => {
  it("gjør et smalt, ferskt medlemskapsoppslag for row.id", () => {
    expect(src).toContain('.from("trip_members" as never)');
    expect(src).toContain('.eq("trip_id", row.id)');
    expect(src).toContain(".maybeSingle()");
  });

  it("velger bare raden som runtime-tur når medlemskap finnes", () => {
    const block = src.slice(src.indexOf("const applySavedTrip"), src.indexOf("React.useEffect(() => {\n    void loadTripsAndMembership"));
    expect(block).toContain("if (isMember)");
    const selectIdx = block.indexOf("setSelectedId((prev) => prev ?? row.id)");
    expect(selectIdx).toBeGreaterThan(block.indexOf("if (isMember)"));
  });

  it("beskytter mot gamle svar via generasjonssjekk", () => {
    expect(src).toContain("if (generation.current === gen)");
  });

  it("gjør ingen Supabase-kall inne i en setState-updater", () => {
    expect(src).not.toMatch(/set[A-Za-z]+\(\([^)]*\) => \{[^}]*supabase\./s);
  });

  it("oppdaterer trips-cachen autoritativt kun én gang", () => {
    const occurrences = src.split('queryClient.setQueryData(["trips", "list"]').length - 1;
    expect(occurrences).toBe(1);
  });

  it("beholder medlemskap som autoritativt ved reload og revokering", () => {
    expect(src).toContain("membershipAuthoritative: true");
    expect(src).toContain("const visible = incoming.filter((t) => memSet.has(t.id))");
  });
});
