/**
 * Fixed location coordinates for Davos region
 */

export interface LocationPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevation?: number;
}

export const DAVOS: LocationPoint = {
  id: "davos",
  name: "Davos",
  lat: 46.80,
  lon: 9.84,
  elevation: 1560,
};

export const MOUNTAIN_AREAS: LocationPoint[] = [
  { id: "parsenn", name: "Parsenn", lat: 46.83, lon: 9.80, elevation: 2844 },
  { id: "jakobshorn", name: "Jakobshorn", lat: 46.77, lon: 9.85, elevation: 2590 },
  { id: "pischa", name: "Pischa", lat: 46.85, lon: 9.90, elevation: 2483 },
  { id: "rinerhorn", name: "Rinerhorn", lat: 46.74, lon: 9.77, elevation: 2490 },
  { id: "madrisa", name: "Madrisa", lat: 46.93, lon: 9.86, elevation: 2602 },
];
