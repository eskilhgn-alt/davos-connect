import { describe, it, expect } from "vitest";
import {
  SHOT_ALGORITHM_VERSION,
  canonicalParticipants,
  computeCommitment,
  computeParticipantHash,
  pickPosition,
  verifyDraw,
} from "@/features/shot/fairness";
import { isDue, remainingMs } from "@/features/shot/types";

const DRAW_ID = "11111111-2222-3333-4444-555555555555";

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `user-${String(i).padStart(3, "0")}`);
}

async function buildDraw(seed: string, userIds: string[]) {
  const canonical = canonicalParticipants(userIds);
  const participants = canonical.map((user_id, position) => ({ user_id, position }));
  const participant_hash = await computeParticipantHash(canonical);
  const seed_commitment = await computeCommitment(seed, DRAW_ID, participant_hash);
  const pick = await pickPosition(seed, DRAW_ID, canonical.length);
  return {
    participants,
    draw: {
      id: DRAW_ID,
      participant_count: canonical.length,
      participant_hash,
      seed_commitment,
      seed_reveal: seed,
      winner_id: canonical[pick.position],
      algorithm_version: SHOT_ALGORITHM_VERSION,
    },
  };
}

describe("shot fairness – deterministisk og verifiserbar", () => {
  it("N=1: eneste deltaker vinner alltid", async () => {
    const { draw, participants } = await buildDraw("seed-a", ids(1));
    expect(draw.winner_id).toBe("user-000");
    const res = await verifyDraw(draw, participants);
    expect(res.ok).toBe(true);
  });

  for (const n of [2, 13]) {
    it(`N=${n}: verifiserer commitment, snapshot og vinner`, async () => {
      const { draw, participants } = await buildDraw(`seed-${n}`, ids(n));
      const res = await verifyDraw(draw, participants);
      expect(res).toMatchObject({ ok: true, status: "verified", commitmentOk: true, participantsOk: true, winnerOk: true });
      expect(participants.map((p) => p.user_id)).toContain(draw.winner_id);
    });
  }

  it("gir samme resultat ved gjentatt beregning (ingen klient-random)", async () => {
    const a = await pickPosition("seed-x", DRAW_ID, 9);
    const b = await pickPosition("seed-x", DRAW_ID, 9);
    expect(a).toEqual(b);
  });

  it("er tilnærmet uniform: alle har samme teoretiske 1/N", async () => {
    const n = 13;
    const counts = new Array(n).fill(0);
    for (let i = 0; i < 2600; i++) {
      const { position } = await pickPosition(`seed-${i}`, DRAW_ID, n);
      counts[position] += 1;
    }
    const expected = 2600 / n;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.55);
      expect(c).toBeLessThan(expected * 1.45);
    }
  });

  it("admin/Eskil har ingen særregel – kun posisjon i snapshot teller", async () => {
    const withAdmin = await buildDraw("seed-admin", ["eskil-admin", ...ids(4)]);
    const renamed = await buildDraw("seed-admin", ["aaaa-vanlig", ...ids(4)]);
    // Samme antall deltakere => samme trukne posisjon uansett hvem som er admin.
    const posA = withAdmin.participants.findIndex((p) => p.user_id === withAdmin.draw.winner_id);
    const posB = renamed.participants.findIndex((p) => p.user_id === renamed.draw.winner_id);
    expect(posA).toBe(posB);
  });

  it("avviser manipulert vinner", async () => {
    const { draw, participants } = await buildDraw("seed-tamper", ids(5));
    const other = participants.find((p) => p.user_id !== draw.winner_id)!;
    const res = await verifyDraw({ ...draw, winner_id: other.user_id }, participants);
    expect(res.ok).toBe(false);
    expect(res.winnerOk).toBe(false);
  });

  it("avviser manipulert deltakerliste", async () => {
    const { draw, participants } = await buildDraw("seed-list", ids(4));
    const res = await verifyDraw(draw, [...participants.slice(0, 3), { user_id: "smugler", position: 3 }]);
    expect(res.participantsOk).toBe(false);
    expect(res.ok).toBe(false);
  });

  it("duplikat bruker i snapshot er ugyldig", async () => {
    const { draw, participants } = await buildDraw("seed-dup", ids(3));
    const dup = [participants[0], { ...participants[1], user_id: participants[0].user_id }, participants[2]];
    const res = await verifyDraw(draw, dup);
    expect(res.participantsOk).toBe(false);
  });

  it("er 'pending' før seed er avslørt", async () => {
    const { draw, participants } = await buildDraw("seed-pending", ids(3));
    const res = await verifyDraw({ ...draw, seed_reveal: null }, participants);
    expect(res.status).toBe("pending");
    expect(res.ok).toBe(false);
  });

  it("ukjent algoritmeversjon feiler", async () => {
    const { draw, participants } = await buildDraw("seed-alg", ids(3));
    const res = await verifyDraw({ ...draw, algorithm_version: "noe-annet" }, participants);
    expect(res.status).toBe("failed");
  });
});

describe("shot countdown – serverklokke er sannheten", () => {
  const serverNow = "2026-08-10T10:00:00.000Z";
  const drawAt = "2026-08-10T10:00:10.000Z";

  it("beregner riktig resttid midt i nedtellingen med klokkeskew", () => {
    // Klienten er 5 minutter feil; skew skal ikke påvirke resttiden.
    const received = 1_000_000;
    expect(remainingMs(drawAt, serverNow, received, received)).toBe(10_000);
    expect(remainingMs(drawAt, serverNow, received, received + 4000)).toBe(6_000);
  });

  it("er due først når serverklokken har passert draw_at", () => {
    const received = 1_000_000;
    const draw = { status: "countdown" as const, draw_at: drawAt };
    expect(isDue(draw, serverNow, received, received + 9_000)).toBe(false);
    expect(isDue(draw, serverNow, received, received + 10_000)).toBe(true);
  });

  it("ferdig trekning er aldri due igjen (finaliseres kun én gang)", () => {
    const received = 1_000_000;
    expect(isDue({ status: "finalized", draw_at: drawAt }, serverNow, received, received + 60_000)).toBe(false);
  });
});
