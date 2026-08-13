/**
 * tripSync — rene, testbare regler for hvordan en verifisert lagret trips-rad
 * skal synkroniseres inn i den kanoniske turtilstanden.
 *
 * Kontrakt:
 *  - En verifisert rad fra RPC er autoritativ for NØYAKTIG den turen den
 *    gjelder. Andre turer skal bevares uendret.
 *  - Valgt trip_id skal aldri bytte tur eller falle til null så lenge turen
 *    fortsatt finnes.
 *  - En feilet eller foreldet lesing skal aldri tømme eller rulle tilbake
 *    nyere turtilstand.
 */
import type { Trip } from "@/hooks/useActiveTrip";

/** Erstatter (eller legger til) turen fra en verifisert lagret rad. */
export function applySavedTripRow(trips: Trip[], saved: Trip | null | undefined): Trip[] {
  if (!saved || !saved.id) return trips;
  const idx = trips.findIndex((t) => t.id === saved.id);
  if (idx === -1) return [...trips, saved];
  const next = trips.slice();
  next[idx] = { ...next[idx], ...saved };
  // Bare én tur kan være aktiv: aktivering av A arkiverer implisitt de andre.
  if (saved.status === "active") {
    return next.map((t) =>
      t.id === saved.id ? t : t.status === "active" ? { ...t, status: "archived" as const } : t,
    );
  }
  return next;
}

/**
 * Slår sammen et nytt lese-resultat med eksisterende tilstand.
 * `ok=false` (feilet lesing) eller `stale=true` (eldre svar) bevarer current.
 */
export function mergeReloadedTrips(
  current: Trip[],
  incoming: Trip[] | null | undefined,
  opts: { ok?: boolean; stale?: boolean; membershipAuthoritative?: boolean } = {},
): Trip[] {
  const { ok = true, stale = false, membershipAuthoritative = false } = opts;
  if (!ok || stale) return current;
  if (!incoming) return current;
  // Når medlemslisten er autoritativ betyr tom liste «ingen tilgang»,
  // ikke «feilet lesing»: da skal tilgangen faktisk fjernes.
  if (incoming.length === 0 && current.length > 0 && !membershipAuthoritative) return current;
  return incoming;
}

/** Bevarer valgt tur når den fortsatt finnes; ellers faller vi til aktiv tur. */
export function resolveSelectedTripId(
  previousId: string | null,
  trips: Trip[],
  fallbackActive = true,
): string | null {
  if (previousId && trips.some((t) => t.id === previousId)) return previousId;
  if (!fallbackActive) return null;
  return trips.find((t) => t.status === "active")?.id ?? null;
}

/** Normaliserer RPC-retur (rad eller array) til én rad. */
export function normalizeRpcTripRow(data: unknown): Trip | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const t = row as Partial<Trip>;
  return t.id ? (row as Trip) : null;
}

/**
 * Eksplisitt turkontekst-guard for asynkrone svar og realtime-nyttelaster.
 *
 * `selectedTripId` er den eneste klientkonteksten. Et svar aksepteres bare når
 * det gjelder valgt tur; en nyttelast uten trip_id (f.eks. «ingen aktiv
 * trekning») er nøytral og aksepteres så lenge en tur faktisk er valgt.
 * Et sent svar for en annen tur skal alltid forkastes.
 */
export function isForSelectedTrip(
  selectedTripId: string | null | undefined,
  payloadTripId: string | null | undefined,
): boolean {
  if (!selectedTripId) return false;
  if (payloadTripId === null || payloadTripId === undefined) return true;
  return payloadTripId === selectedTripId;
}
