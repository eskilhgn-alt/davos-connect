/**
 * Gütta-match — ren, deterministisk score (0–100) med forklaring.
 *
 * Regler:
 *  - Kun delte signaler: kvalitet (rating), volumsikkerhet (antall
 *    vurderinger), kategorirelevans, åpent nå og prisnivå.
 *  - ALDRI personlig avstand, brukerposisjon, LLM eller skjult AI.
 *  - Samme input → samme output for alle brukere.
 */
import type { DiscoverCategory, DiscoverPlace } from "./types";

export interface GuttaMatch {
  score: number;
  /** Korte, konkrete signaler, f.eks. «svært godt vurdert av mange». */
  reasons: string[];
}

/** Volumsikkerhet: 0 → 0, 50 → ~0.5, 500+ → ~1. */
function volumeConfidence(count: number | null): number {
  if (!count || count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / Math.log10(501));
}

/** Kategorirelevans: åpningstider betyr mer for spise/afterski. */
function opennessWeight(category: DiscoverCategory): number {
  return category === "spise" || category === "afterski" ? 12 : 6;
}

function priceScore(priceLevel: number | null): number {
  if (priceLevel == null) return 0;
  // Favoriser moderat pris litt; ikke straff dyre steder hardt.
  return [0, 6, 8, 5, 3][Math.max(0, Math.min(4, priceLevel))] ?? 0;
}

export function guttaMatch(place: DiscoverPlace): GuttaMatch {
  const reasons: string[] = [];

  const conf = volumeConfidence(place.ratingCount);
  const quality = place.rating != null ? Math.max(0, (place.rating - 3) / 2) : 0; // 3.0→0, 5.0→1
  // Kvalitet vektes av hvor sikre vi er på tallet.
  const qualityPoints = quality * conf * 60;

  if (place.rating != null && place.ratingCount != null) {
    if (place.rating >= 4.5 && conf >= 0.6) reasons.push("svært godt vurdert av mange");
    else if (place.rating >= 4.2 && conf >= 0.4) reasons.push("godt vurdert av flere");
    else if (conf < 0.25) reasons.push("få vurderinger – usikkert");
    else reasons.push("jevnt vurdert");
  } else {
    reasons.push("ingen vurderinger tilgjengelig");
  }

  let openPoints = 0;
  if (place.openNow === true) {
    openPoints = opennessWeight(place.category);
    reasons.push("åpent nå");
  } else if (place.openNow === false) {
    reasons.push("stengt nå");
  }

  const pricePoints = priceScore(place.priceLevel);
  if (place.priceLevel != null) {
    reasons.push(`prisnivå ${"€".repeat(Math.max(1, place.priceLevel))}`);
  }

  // Kategorirelevans: stedet er allerede filtrert på kategori, så dette er
  // en fast grunnpott slik at score alltid er sammenlignbar innen kategori.
  const relevancePoints = 15;

  const score = Math.round(
    Math.max(0, Math.min(100, qualityPoints + openPoints + pricePoints + relevancePoints)),
  );
  return { score, reasons };
}

/** Delt standardrekkefølge. Stabil (id) ved lik score. */
export function sortByGuttaMatch(places: DiscoverPlace[]): DiscoverPlace[] {
  return [...places].sort((a, b) => {
    const d = guttaMatch(b).score - guttaMatch(a).score;
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

export function matchLabel(score: number): string {
  if (score >= 70) return "Sterk Gütta-match";
  if (score >= 50) return "God Gütta-match";
  if (score >= 30) return "Kan funke";
  return "Svak match";
}
