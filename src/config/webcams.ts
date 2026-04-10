/**
 * Webcam configuration for Davos Klosters
 * Supports both video embeds (feratel WebTV) and snapshot images
 */

export interface Webcam {
  id: string;
  name: string;
  area: string;
  /** Snapshot image URL for fallback/thumbnail */
  snapshotUrl: string;
  /** Video embed URL (feratel WebTV) - if available, preferred for modal */
  videoUrl?: string;
  /** External URL for "open in browser" fallback */
  externalUrl?: string;
  /** Camera ID used by feratel */
  camId: string;
  elevation?: number;
}

// Build feratel video player URL from cam ID
function getVideoUrl(camId: string): string {
  return `https://webtv.feratel.com/webtv/?design=v5&cam=${camId}&c1=0&c2=0&autoplay=1`;
}

// Build external feratel page URL
function getExternalUrl(camId: string): string {
  return `https://webtv.feratel.com/webtv/?design=v5&cam=${camId}`;
}

export const WEBCAMS: Webcam[] = [
  // === Ski mountains first (shown in top 6) ===
  {
    id: "davos-dorf",
    name: "Weissfluhjoch",
    area: "Parsenn",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4002.jpeg",
    camId: "4002",
    videoUrl: getVideoUrl("4002"),
    externalUrl: getExternalUrl("4002"),
    elevation: 2660,
  },
  {
    id: "davos-platz-jakobshorn",
    name: "Jakobshorn",
    area: "Jakobshorn",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4003.jpeg",
    camId: "4003",
    videoUrl: getVideoUrl("4003"),
    externalUrl: getExternalUrl("4003"),
    elevation: 2590,
  },
  {
    id: "schaffurggli",
    name: "Schaffürggli",
    area: "Madrisa",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4007.jpeg",
    camId: "4007",
    videoUrl: getVideoUrl("4007"),
    externalUrl: getExternalUrl("4007"),
    elevation: 2390,
  },
  {
    id: "madrisaland",
    name: "Madrisaland",
    area: "Madrisa",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4011.jpeg",
    camId: "4011",
    videoUrl: getVideoUrl("4011"),
    externalUrl: getExternalUrl("4011"),
    elevation: 1892,
  },
  {
    id: "jatzmeder",
    name: "Jatzmeder",
    area: "Rinerhorn",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4310.jpeg",
    camId: "4310",
    videoUrl: getVideoUrl("4310"),
    externalUrl: getExternalUrl("4310"),
    elevation: 2050,
  },
  {
    id: "davos-wolfgang",
    name: "Davosersee",
    area: "Pischa",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4006.jpeg",
    camId: "4006",
    videoUrl: getVideoUrl("4006"),
    externalUrl: getExternalUrl("4006"),
    elevation: 1600,
  },
  // === Other webcams ===
  {
    id: "davos-platz-tsz",
    name: "Davos Platz",
    area: "Sportzentrum",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4004.jpeg",
    camId: "4004",
    videoUrl: getVideoUrl("4004"),
    externalUrl: getExternalUrl("4004"),
    elevation: 1560,
  },
  {
    id: "klosters-sportzentrum",
    name: "Klosters",
    area: "Sportzentrum",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4005.jpeg",
    camId: "4005",
    videoUrl: getVideoUrl("4005"),
    externalUrl: getExternalUrl("4005"),
    elevation: 1182,
  },
  {
    id: "monbiel",
    name: "Klosters",
    area: "Monbiel Parkplatz",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4008.jpeg",
    camId: "4008",
    videoUrl: getVideoUrl("4008"),
    externalUrl: getExternalUrl("4008"),
    elevation: 1318,
  },
  {
    id: "garfiun",
    name: "Klosters",
    area: "Garfiun",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4009.jpeg",
    camId: "4009",
    videoUrl: getVideoUrl("4009"),
    externalUrl: getExternalUrl("4009"),
    elevation: 1375,
  },
  {
    id: "bundelti",
    name: "Klosters",
    area: "Bündelti",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4311.jpeg",
    camId: "4311",
    videoUrl: getVideoUrl("4311"),
    externalUrl: getExternalUrl("4311"),
    elevation: 1225,
  },
  {
    id: "langlaufzentrum",
    name: "Langlauf",
    area: "Langlaufzentrum",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4312.jpeg",
    camId: "4312",
    videoUrl: getVideoUrl("4312"),
    externalUrl: getExternalUrl("4312"),
    elevation: 1545,
  },
  {
    id: "snowfarming",
    name: "Snowfarming",
    area: "Snowfarming",
    snapshotUrl: "https://wtvpict.feratel.com/picture/44/4313.jpeg",
    camId: "4313",
    videoUrl: getVideoUrl("4313"),
    externalUrl: getExternalUrl("4313"),
    elevation: 1640,
  },
];

// Featured webcams for weather page
export const FEATURED_WEBCAMS: Webcam[] = [
  WEBCAMS[0], // Davos Dorf - Weissfluhjoch
  WEBCAMS[1], // Davos Platz - Jakobshorn
  WEBCAMS[5], // Schaffürggli
  WEBCAMS[8], // Madrisaland
  WEBCAMS[9], // Jatzmeder
];

// Get proxy URL for a webcam snapshot image
export function getWebcamProxyUrl(snapshotUrl: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${baseUrl}/functions/v1/webcam-proxy?url=${encodeURIComponent(snapshotUrl)}`;
}
