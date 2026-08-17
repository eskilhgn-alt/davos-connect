/**
 * tripAdminActions — én sannhet for hvilke adminhandlinger som er lovlige for
 * en tur, speilet mot RPC-kontrakten i 20260815_port0c_trip_rpc_hardening.sql:
 *
 *   draft    — redigerbar, kan aktiveres, kan arkiveres.
 *   active   — redigerbar, kan IKKE arkiveres direkte (aktiver en annen tur i
 *              stedet, det arkiverer denne automatisk), og er allerede aktiv.
 *   archived — skrivebeskyttet (ingen redigering), kan reaktiveres, og
 *              arkivering er et no-op (strengt idempotent i RPC-en).
 */
import { isArchivedStatus, isWritableStatus, type TripStatus } from "./tripStatus";

export interface TripAdminActions {
  canEdit: boolean;
  canActivate: boolean;
  canArchive: boolean;
}

export function tripAdminActions(
  status: TripStatus | string | null | undefined,
  isActive: boolean,
): TripAdminActions {
  return {
    canEdit: isWritableStatus(status),
    canActivate: !isActive,
    canArchive: !isActive && !isArchivedStatus(status) && isWritableStatus(status),
  };
}
