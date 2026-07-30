/**
 * useGeolocation — tynn wrapper over `LocationSharingContext`.
 *
 * Beholder tidligere API-form (`enabled`, `position`, `loading`, `error`,
 * `request`, `disable`) slik at eksisterende komponenter fortsetter å virke,
 * men all state og pollingen bor nå i én delt provider.
 *
 * `enabled` er alltid `false` ved oppstart av ny sesjon — GPS starter aldri
 * før brukeren eksplisitt trykker «Del min posisjon».
 */
import { useLocationSharing, type GeoPosition } from "@/contexts/LocationSharingContext";

export type { GeoPosition };

export function useGeolocation() {
  const { enabled, position, positionUpdatedAt, loading, error, startSharing, stopSharing } =
    useLocationSharing();
  return {
    enabled,
    position,
    positionUpdatedAt,
    loading,
    error,
    request: startSharing,
    disable: () => { void stopSharing(); },
  };
}
