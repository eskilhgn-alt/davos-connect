/**
 * Live Info configuration for Davos Klosters
 * Embed-first approach - no scraping, just iframes with fallbacks
 */

export interface LiveInfoSource {
  id: string;
  title: string;
  url: string;
  description?: string;
}

export interface FeaturedWebcam {
  id: string;
  name: string;
  area: string;
  imageUrl: string;
  pageUrl: string;
}

// Map sources
export const MAPS: Record<string, LiveInfoSource> = {
  nord: {
    id: "nord",
    title: "Kart Nord",
    url: "https://www.siscontrol.ch/d001/sismap/davos-nord/2",
    description: "Parsenn, Pischa, Madrisa"
  },
  syd: {
    id: "syd",
    title: "Kart Sør",
    url: "https://www.siscontrol.ch/d001/sismap/davos-sued/2",
    description: "Jakobshorn, Rinerhorn"
  },
  interaktiv: {
    id: "interaktiv",
    title: "Interaktivt kart",
    url: "https://api.davos.ch/fileadmin/davos/various/interaktivekarte/?season=wi&lang=en",
    description: "Full kartvisning med POI"
  }
};

// Webcams page embed
export const WEBCAMS_PAGE: LiveInfoSource = {
  id: "webcams",
  title: "Alle webcams",
  url: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams",
  description: "Live-bilder fra hele skiområdet"
};

// Featured webcams - one per mountain area
export const FEATURED_WEBCAMS: FeaturedWebcam[] = [
  {
    id: "parsenn",
    name: "Weissfluhjoch",
    area: "Parsenn",
    imageUrl: "https://www.davosklostersmountains.ch/webcam/weissfluhjoch.jpg",
    pageUrl: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams"
  },
  {
    id: "jakobshorn",
    name: "Jakobshorn Gipfel",
    area: "Jakobshorn",
    imageUrl: "https://www.davosklostersmountains.ch/webcam/jakobshorn.jpg",
    pageUrl: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams"
  },
  {
    id: "pischa",
    name: "Pischa",
    area: "Pischa",
    imageUrl: "https://www.davosklostersmountains.ch/webcam/pischa.jpg",
    pageUrl: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams"
  },
  {
    id: "rinerhorn",
    name: "Rinerhorn",
    area: "Rinerhorn",
    imageUrl: "https://www.davosklostersmountains.ch/webcam/rinerhorn.jpg",
    pageUrl: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams"
  },
  {
    id: "madrisa",
    name: "Madrisa",
    area: "Madrisa",
    imageUrl: "https://www.davosklostersmountains.ch/webcam/madrisa.jpg",
    pageUrl: "https://www.davosklostersmountains.ch/en/mountains/winter/live-info/webcams"
  }
];
