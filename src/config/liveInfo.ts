/**
 * Live info sources. Derived from the central trip config.
 * Destination-dependent URLs live in `src/config/trip.ts` — edit them there.
 *
 * This file preserves the historical `MAPS` / `WEBCAMS_PAGE` / `FEATURED_WEBCAMS`
 * exports so existing screens keep working while we migrate to the trip model.
 */
import { ACTIVE_TRIP } from "./trip";

export interface LiveInfoSource {
  id: string;
  title: string;
  url: string;
  description?: string;
  embeddable?: boolean;
}

export interface FeaturedWebcam {
  id: string;
  name: string;
  area: string;
  imageUrl: string;
  pageUrl: string;
}

const trailMap = ACTIVE_TRIP.officialLinks.trailMap;
const webcamsLink = ACTIVE_TRIP.officialLinks.webcams;

/**
 * Map sources. For the active trip we only expose the official trail-map link.
 * Step-1 placeholder — richer map layers will be wired through the trip model
 * in a later step.
 */
export const MAPS: Record<string, LiveInfoSource> = {
  offisiell: trailMap
    ? {
        id: trailMap.id,
        title: trailMap.title,
        url: trailMap.url,
        description: trailMap.description,
        embeddable: trailMap.embeddable ?? false,
      }
    : {
        id: "trail-map",
        title: "Løypekart",
        url: "about:blank",
        description: "Ikke konfigurert for aktiv tur",
        embeddable: false,
      },
};

export const WEBCAMS_PAGE: LiveInfoSource = webcamsLink
  ? {
      id: webcamsLink.id,
      title: webcamsLink.title,
      url: webcamsLink.url,
      description: webcamsLink.description,
      embeddable: false,
    }
  : {
      id: "webcams",
      title: "Webkameraer",
      url: "about:blank",
      embeddable: false,
    };

/** No featured webcam thumbnails wired up yet for the active trip. */
export const FEATURED_WEBCAMS: FeaturedWebcam[] = [];
