/**
 * Webcam configuration for Davos Klosters
 * Uses feratel webcam images and video player URLs
 */

export interface Webcam {
  id: string;
  name: string;
  area: string;
  imageUrl: string;
  /** Feratel webtv video player URL (for live video stream) */
  videoUrl?: string;
  /** Camera ID used by feratel (4-digit number) */
  camId: string;
  elevation?: number;
}

// Build feratel video player URL from cam ID
function getVideoUrl(camId: string): string {
  return `https://webtv.feratel.com/webtv/?design=v5&cam=${camId}&c1=0&c2=0`;
}

export const WEBCAMS: Webcam[] = [
  // Panorama
  {
    id: "davos-dorf",
    name: "Davos Dorf",
    area: "Weissfluhjoch",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4002.jpeg",
    camId: "4002",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 2660,
  },
  {
    id: "davos-platz-jakobshorn",
    name: "Davos Platz",
    area: "Jakobshorn",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4003.jpeg",
    camId: "4003",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 2590,
  },
  {
    id: "davos-platz-tsz",
    name: "Davos Platz",
    area: "Tourismus- und Sportzentrum",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4004.jpeg",
    camId: "4004",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1560,
  },
  {
    id: "klosters-sportzentrum",
    name: "Klosters",
    area: "Sportzentrum",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4005.jpeg",
    camId: "4005",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1182,
  },
  {
    id: "davos-wolfgang",
    name: "Davos Wolfgang",
    area: "Davosersee",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4006.jpeg",
    camId: "4006",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1600,
  },
  // Mountains
  {
    id: "schaffurggli",
    name: "Klosters Dorf",
    area: "Bergstation Schaffürggli",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4007.jpeg",
    camId: "4007",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 2390,
  },
  {
    id: "monbiel",
    name: "Klosters",
    area: "Monbiel Parkplatz",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4008.jpeg",
    camId: "4008",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1318,
  },
  {
    id: "garfiun",
    name: "Klosters",
    area: "Garfiun",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4009.jpeg",
    camId: "4009",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1375,
  },
  {
    id: "madrisaland",
    name: "Klosters Dorf",
    area: "Madrisaland",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4011.jpeg",
    camId: "4011",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1892,
  },
  {
    id: "jatzmeder",
    name: "Davos Glaris",
    area: "Jatzmeder",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4310.jpeg",
    camId: "4310",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 2050,
  },
  {
    id: "bundelti",
    name: "Klosters",
    area: "Bündelti",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4311.jpeg",
    camId: "4311",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1225,
  },
  {
    id: "langlaufzentrum",
    name: "Davos",
    area: "Langlaufzentrum",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4312.jpeg",
    camId: "4312",
    get videoUrl() { return getVideoUrl(this.camId); },
    elevation: 1545,
  },
  {
    id: "snowfarming",
    name: "Davos",
    area: "Snowfarming",
    imageUrl: "https://wtvpict.feratel.com/picture/44/4313.jpeg",
    camId: "4313",
    get videoUrl() { return getVideoUrl(this.camId); },
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

// Get proxy URL for a webcam image
export function getWebcamProxyUrl(imageUrl: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${baseUrl}/functions/v1/webcam-proxy?url=${encodeURIComponent(imageUrl)}`;
}
