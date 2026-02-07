/**
 * Haptic feedback utility – uses Vibration API (supported on Android & some iOS PWAs)
 * Falls back silently when not available.
 */

const STORAGE_KEY = "haptics-enabled";

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== "false"; // default ON
}

export function setHapticsEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

function vibrate(pattern: number | number[]) {
  if (!isHapticsEnabled()) return;
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

/** Light tap – button press, toggle */
export function hapticLight() {
  vibrate(10);
}

/** Medium tap – pull-to-refresh threshold, selection */
export function hapticMedium() {
  vibrate(20);
}

/** Heavy tap – error, destructive action */
export function hapticHeavy() {
  vibrate(40);
}

/** Success – completion, refresh done */
export function hapticSuccess() {
  vibrate([10, 30, 10]);
}
