/**
 * Webcam sources for the active trip.
 * Destination URLs live in `src/config/trip.ts`.
 *
 * Step-1 note: we intentionally do NOT ship any embedded/proxied Val Thorens
 * webcam URLs yet. `WEBCAMS` maps the trip config into the historical `Webcam`
 * shape so existing components keep rendering — but they will show a single
 * "open on valthorens.com" link tile rather than live thumbnails. Rich webcam
 * integration is planned for a later step.
 */
import { ACTIVE_TRIP } from "./trip";

export interface Webcam {
  id: string;
  name: string;
  area: string;
  /** Snapshot image URL for fallback/thumbnail. Empty when not available. */
  snapshotUrl: string;
  /** Video embed URL, if any. */
  videoUrl?: string;
  /** External URL for "open in browser" fallback. */
  externalUrl?: string;
  /** Camera ID (kept for backwards compatibility, may be empty). */
  camId: string;
  elevation?: number;
}

export const WEBCAMS: Webcam[] = ACTIVE_TRIP.webcams.map((w) => ({
  id: w.id,
  name: w.name,
  area: w.area ?? ACTIVE_TRIP.destination,
  snapshotUrl: w.snapshotUrl ?? "",
  externalUrl: w.externalUrl,
  camId: w.id,
}));

export const FEATURED_WEBCAMS: Webcam[] = WEBCAMS.slice(0, 6);

/** Get proxy URL for a webcam snapshot image. Returns empty string if no snapshot. */
export function getWebcamProxyUrl(snapshotUrl: string): string {
  if (!snapshotUrl) return "";
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${baseUrl}/functions/v1/webcam-proxy?url=${encodeURIComponent(snapshotUrl)}`;
}
