/** Delte typer for Shot-trekning (ny, ren modell — ingen legacy gamification). */

export interface ShotDraw {
  id: string;
  trip_id: string;
  initiated_by: string;
  status: "countdown" | "finalized";
  server_started_at: string;
  draw_at: string;
  finalized_at: string | null;
  participant_count: number;
  participant_hash: string;
  seed_commitment: string;
  seed_reveal: string | null;
  winner_id: string | null;
  proof_counter: number | null;
  proof_value: number | null;
  algorithm_version: string;
  created_at: string;
}

export interface ShotParticipant {
  user_id: string;
  position: number;
}

export interface ShotState {
  server_now: string;
  draw: ShotDraw | null;
  participants: ShotParticipant[];
}

export interface ShotStatRow {
  user_id: string;
  times_in: number;
  times_drawn: number;
  expected_draws: number;
  last_drawn_at: string | null;
}

/**
 * Resttid i millisekunder, korrigert for klokkeskew mellom klient og server.
 * Serverens `server_now` er alltid sannheten; den lokale timeren driver kun
 * visningen.
 */
export function remainingMs(
  drawAt: string,
  serverNow: string,
  serverReceivedAtLocal: number,
  nowLocal: number,
): number {
  const elapsedSinceFetch = nowLocal - serverReceivedAtLocal;
  const serverNowMs = Date.parse(serverNow) + elapsedSinceFetch;
  return Math.max(0, Date.parse(drawAt) - serverNowMs);
}

/** True når serverklokken (skew-korrigert) har passert draw_at. */
export function isDue(
  draw: Pick<ShotDraw, "status" | "draw_at">,
  serverNow: string,
  serverReceivedAtLocal: number,
  nowLocal: number,
): boolean {
  if (draw.status !== "countdown") return false;
  return remainingMs(draw.draw_at, serverNow, serverReceivedAtLocal, nowLocal) === 0;
}
