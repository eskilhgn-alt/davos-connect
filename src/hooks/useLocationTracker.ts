/**
 * useLocationTracker — tynn wrapper over `LocationSharingContext`.
 *
 * All GPS-polling og databasesynk lever i én delt provider. Denne hooken
 * eksponerer bare status + start/stopp til skjermer som bryr seg (typisk
 * CrewMapScreen). Den oppretter ingen egen watcher eller poller.
 */
import { useLocationSharing } from "@/contexts/LocationSharingContext";

export function useLocationTracker() {
  const { enabled, position, loading, error, startSharing, stopSharing } = useLocationSharing();
  return { enabled, position, loading, error, startSharing, stopSharing };
}
