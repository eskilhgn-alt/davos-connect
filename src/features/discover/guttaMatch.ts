/**
 * Gütta-match — provider-nøytral gruppescore.
 *
 * EØS-krav (Google Maps Platform EEA-vilkår fra 8. juli 2025):
 *  - Google Places-innhold (rating, antall anmeldelser, åpent nå, prisnivå)
 *    skal ALDRI brukes til å beregne eller omrangere en egen score.
 *  - Gütta-match kan bare komme fra FØRSTEPARTS gruppesignaler på turnivå:
 *    lagret, stemt og besøkt av turmedlemmer.
 *  - Uten slike signaler: ærlig «Ikke nok gruppedata». Ingen oppdiktet score,
 *    og providerens egen rekkefølge beholdes uendret.
 */
import type { DiscoverPlace } from "./types";

/** Førsteparts signaler for ett sted, aggregert per tur. */
export interface GroupSignals {
  /** Antall turmedlemmer som har lagret stedet. */
  saved: number;
  /** Antall stemmer i turens avstemninger. */
  voted: number;
  /** Antall registrerte besøk. */
  visited: number;
}

export type GroupSignalMap = Record<string, GroupSignals | undefined>;

export type GuttaMatch =
  | { available: true; score: number; reasons: string[] }
  | { available: false; reason: "not_enough_group_data" };

export const MATCH_UNAVAILABLE_TEXT = "Ikke nok gruppedata";

const SAVED_POINTS = 8;
const VOTED_POINTS = 6;
const VISITED_POINTS = 10;

function hasSignals(s: GroupSignals | undefined | null): s is GroupSignals {
  if (!s) return false;
  return (s.saved ?? 0) > 0 || (s.voted ?? 0) > 0 || (s.visited ?? 0) > 0;
}

/**
 * Beregner Gütta-match utelukkende fra gruppesignaler.
 * `place` brukes kun som identitet — aldri som datakilde for score.
 */
export function guttaMatch(
  place: Pick<DiscoverPlace, "id">,
  signals?: GroupSignals | null,
): GuttaMatch {
  void place;
  if (!hasSignals(signals)) return { available: false, reason: "not_enough_group_data" };

  const reasons: string[] = [];
  if (signals.saved > 0) reasons.push(`lagret av ${signals.saved}`);
  if (signals.voted > 0) reasons.push(`${signals.voted} stemmer`);
  if (signals.visited > 0) reasons.push(`besøkt ${signals.visited} ganger`);

  const raw =
    signals.saved * SAVED_POINTS + signals.voted * VOTED_POINTS + signals.visited * VISITED_POINTS;
  return { available: true, score: Math.max(0, Math.min(100, Math.round(raw))), reasons };
}

/**
 * Standardrekkefølge. Uten gruppesignaler beholdes providerens egen rekkefølge
 * uendret — vi omranger aldri på Google-innhold.
 */
export function orderPlaces(places: DiscoverPlace[], signalsById?: GroupSignalMap): DiscoverPlace[] {
  if (!signalsById || Object.keys(signalsById).length === 0) return [...places];
  const scoreOf = (p: DiscoverPlace) => {
    const m = guttaMatch(p, signalsById[p.id]);
    return m.available ? m.score : -1;
  };
  return [...places]
    .map((p, i) => ({ p, i, s: scoreOf(p) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.p);
}

export function matchLabel(match: GuttaMatch): string {
  if (!match.available) return MATCH_UNAVAILABLE_TEXT;
  if (match.score >= 70) return "Sterk Gütta-match";
  if (match.score >= 50) return "God Gütta-match";
  if (match.score >= 30) return "Kan funke";
  return "Svak match";
}
