/**
 * useLocationTracker — tynn wrapper over `LocationSharingContext`.
 *
 * All GPS-polling og databasesynk lever i én delt provider. Denne hooken
 * eksponerer bare `startSharing` / `stopSharing` + gjeldende status til
 * skjermer som bryr seg (typisk CrewMapScreen).
 */
import { useLocationSharing } from "@/contexts/LocationSharingContext";

export function useLocationTracker() {
  const { enabled, position, error, startSharing, stopSharing } = useLocationSharing();
  return { enabled, position, error, startSharing, stopSharing };
}
