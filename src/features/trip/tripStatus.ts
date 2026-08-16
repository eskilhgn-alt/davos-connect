/**
 * tripStatus — den ene sannheten for turens livssyklus i klienten.
 *
 * Modell (speiler `public.trip_status` i databasen etter Port 0b/0c):
 *   draft    — nyopprettet, redigerbar av turadmin, IKKE den aktive turen.
 *   active   — nøyaktig én om gangen. Vanlige, aktive flyter kjører her.
 *   archived — permanent skrivebeskyttet for alle vanlige og admin-veier.
 *
 * Regler:
 *   - `isWritableStatus` = draft | active. Håndheves også i RLS/RPC.
 *   - `isArchivedStatus` er den ENESTE read-only-tilstanden.
 *   - En draft skal aldri automatisk velges som «aktiv tur» i vanlige flyter,
 *     men den skal kunne velges eksplisitt av en turadmin som redigerer den.
 */
export type TripStatus = "draft" | "active" | "archived";

export const TRIP_STATUSES: readonly TripStatus[] = ["draft", "active", "archived"] as const;

export function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === "string" && (TRIP_STATUSES as readonly string[]).includes(value);
}

/** Ukjent/fremtidig status behandles konservativt som ikke-skrivbar. */
export function isWritableStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "draft";
}

export function isArchivedStatus(status: string | null | undefined): boolean {
  return status === "archived";
}

export function isDraftStatus(status: string | null | undefined): boolean {
  return status === "draft";
}

/** Kun `active` er den turen vanlige, aktive flyter skal falle tilbake til. */
export function isActiveStatus(status: string | null | undefined): boolean {
  return status === "active";
}

export function tripStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return "Utkast";
    case "active":
      return "Aktiv";
    case "archived":
      return "Arkivert";
    default:
      return "Ukjent";
  }
}
