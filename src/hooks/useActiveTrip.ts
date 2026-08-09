/**
 * Turtypen. Runtime-tilstanden for turer bor UTELUKKENDE i TripContext —
 * denne filen eksporterer bare typen, slik at ingen parallell store kan
 * oppstå. (Tidligere `useActiveTrip()`-hook er pensjonert.)
 */
export interface Trip {
  id: string;
  name: string;
  destination: string;
  country: string | null;
  timezone: string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "archived";
  destination_config: Record<string, unknown>;
}
