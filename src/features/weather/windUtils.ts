// src/features/weather/windUtils.ts

/**
 * Converts wind speed (m/s) to Norwegian Beaufort-like label
 */
export function windStrengthLabel(ms: number): string {
  if (ms < 0.3) return "Stille";
  if (ms <= 1.5) return "Flau vind";
  if (ms <= 3.3) return "Svak vind";
  if (ms <= 5.4) return "Lett bris";
  if (ms <= 7.9) return "Laber bris";
  if (ms <= 10.7) return "Frisk bris";
  if (ms <= 13.8) return "Liten kuling";
  if (ms <= 17.1) return "Stiv kuling";
  if (ms <= 20.7) return "Sterk kuling";
  if (ms <= 24.4) return "Liten storm";
  if (ms <= 28.4) return "Full storm";
  if (ms <= 32.6) return "Sterk storm";
  return "Orkan";
}

/**
 * Converts wind direction (degrees) to Norwegian compass direction
 */
export function windCompass(deg: number): string {
  // Normalize to 0-360
  const normalized = ((deg % 360) + 360) % 360;
  
  // 8 compass directions, each covering 45 degrees
  // N: 337.5-22.5, NØ: 22.5-67.5, Ø: 67.5-112.5, etc.
  if (normalized >= 337.5 || normalized < 22.5) return "N";
  if (normalized < 67.5) return "NØ";
  if (normalized < 112.5) return "Ø";
  if (normalized < 157.5) return "SØ";
  if (normalized < 202.5) return "S";
  if (normalized < 247.5) return "SV";
  if (normalized < 292.5) return "V";
  return "NV";
}

/**
 * Calculates circular mean for wind direction (degrees)
 * Since degrees are circular (0° = 360°), we can't use simple average
 */
export function circularMeanDegrees(degrees: number[]): number {
  if (degrees.length === 0) return 0;
  
  // Convert to radians and calculate mean of sin/cos components
  let sinSum = 0;
  let cosSum = 0;
  
  for (const deg of degrees) {
    const rad = (deg * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  
  const meanSin = sinSum / degrees.length;
  const meanCos = cosSum / degrees.length;
  
  // Convert back to degrees
  let meanDeg = (Math.atan2(meanSin, meanCos) * 180) / Math.PI;
  
  // Normalize to 0-360
  if (meanDeg < 0) meanDeg += 360;
  
  return Math.round(meanDeg);
}

/**
 * Formats wind display string
 * e.g., "12 m/s (liten kuling) fra NV"
 */
export function formatWindDisplay(
  speedMs: number,
  directionDeg?: number
): string {
  const strength = windStrengthLabel(speedMs);
  const speed = Math.round(speedMs);
  
  if (directionDeg !== undefined && !isNaN(directionDeg)) {
    const compass = windCompass(directionDeg);
    return `${speed} m/s (${strength}) fra ${compass}`;
  }
  
  return `${speed} m/s (${strength})`;
}
