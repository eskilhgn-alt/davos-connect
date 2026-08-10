/**
 * Fairness-verifisering for Shot-trekning.
 *
 * Alt her kan kjøres i klienten uten hemmelig servertilgang. Etter at en
 * trekning er finalisert publiserer serveren `seed_reveal`, og da kan hvem som
 * helst reprodusere både commitment og vinner.
 *
 * Algoritme (algorithm_version = "sha256-rejection-v1"):
 *   participant_hash = sha256(user_ids sortert stigende, join ",")
 *   seed_commitment  = sha256(seed + ":" + draw_id + ":" + participant_hash)
 *   vinnerposisjon   = rejection sampling over sha256(seed+":"+draw_id+":"+i)
 *                      der de 4 første bytene tolkes som uint32 big-endian.
 *                      Verdier >= floor(2^32 / N) * N forkastes (ingen modulo-bias).
 */

export const SHOT_ALGORITHM_VERSION = "sha256-rejection-v1";

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

/** Kanonisk deltakerliste: sortert stigende på user_id (tekstsortering). */
export function canonicalParticipants(userIds: string[]): string[] {
  return [...userIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function participantHashInput(userIds: string[]): string {
  return canonicalParticipants(userIds).join(",");
}

export function computeParticipantHash(userIds: string[]): Promise<string> {
  return sha256Hex(participantHashInput(userIds));
}

export function computeCommitment(
  seed: string,
  drawId: string,
  participantHash: string,
): Promise<string> {
  return sha256Hex(`${seed}:${drawId}:${participantHash}`);
}

export interface PickResult {
  position: number;
  counter: number;
  value: number;
}

/** Deterministisk vinnerposisjon — identisk med serverens SQL-implementasjon. */
export async function pickPosition(
  seed: string,
  drawId: string,
  n: number,
): Promise<PickResult> {
  if (!Number.isInteger(n) || n < 1) throw new Error("invalid_participant_count");
  const limit = Math.floor(4294967296 / n) * n;
  for (let i = 0; i <= 10000; i++) {
    const d = await sha256Bytes(`${seed}:${drawId}:${i}`);
    const value = ((d[0] << 24) >>> 0) + (d[1] << 16) + (d[2] << 8) + d[3];
    if (value < limit) return { position: value % n, counter: i, value };
  }
  throw new Error("rejection_sampling_exhausted");
}

export interface VerifiableDraw {
  id: string;
  participant_count: number;
  participant_hash: string;
  seed_commitment: string;
  seed_reveal: string | null;
  winner_id: string | null;
  algorithm_version: string;
}

export interface VerificationResult {
  ok: boolean;
  /** "pending" så lenge seed ikke er avslørt (før finalisering). */
  status: "pending" | "verified" | "failed";
  commitmentOk: boolean;
  participantsOk: boolean;
  winnerOk: boolean;
  expectedWinnerId: string | null;
  reason?: string;
}

/**
 * Verifiser en ferdig trekning mot publisert bevis.
 * `participants` er (user_id, position) fra serverens snapshot.
 */
export async function verifyDraw(
  draw: VerifiableDraw,
  participants: { user_id: string; position: number }[],
): Promise<VerificationResult> {
  const base: VerificationResult = {
    ok: false,
    status: "pending",
    commitmentOk: false,
    participantsOk: false,
    winnerOk: false,
    expectedWinnerId: null,
  };

  if (draw.algorithm_version !== SHOT_ALGORITHM_VERSION) {
    return { ...base, status: "failed", reason: "unknown_algorithm" };
  }
  if (!draw.seed_reveal) return { ...base, reason: "seed_not_revealed" };

  const ordered = [...participants].sort((a, b) => a.position - b.position);
  const ids = ordered.map((p) => p.user_id);
  const canonical = canonicalParticipants(ids);
  const positionsOk =
    ordered.length === draw.participant_count &&
    new Set(ids).size === ids.length &&
    ordered.every((p, i) => p.position === i && p.user_id === canonical[i]);

  const participantHash = await computeParticipantHash(ids);
  const participantsOk = positionsOk && participantHash === draw.participant_hash;

  const commitment = await computeCommitment(draw.seed_reveal, draw.id, draw.participant_hash);
  const commitmentOk = commitment === draw.seed_commitment;

  const pick = await pickPosition(draw.seed_reveal, draw.id, draw.participant_count);
  const expectedWinnerId = ordered.find((p) => p.position === pick.position)?.user_id ?? null;
  const winnerOk = !!expectedWinnerId && expectedWinnerId === draw.winner_id;

  const ok = participantsOk && commitmentOk && winnerOk;
  return {
    ok,
    status: ok ? "verified" : "failed",
    commitmentOk,
    participantsOk,
    winnerOk,
    expectedWinnerId,
  };
}
