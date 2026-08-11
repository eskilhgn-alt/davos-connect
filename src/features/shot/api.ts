/**
 * Klienttransport for Shot. All mutasjon går gjennom Edge Function `shot-draw`,
 * slik at samme autoritative serverflyt både oppretter/avgjør trekningen og
 * sender deduplisert push. Klienten kaller aldri mutasjons-RPC-ene direkte.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ShotState } from "@/features/shot/types";

async function invoke(body: Record<string, unknown>): Promise<ShotState> {
  const { data, error } = await supabase.functions.invoke("shot-draw", { body });
  if (error) throw error;
  const payload = data as { error?: string } & ShotState;
  if (payload?.error) throw new Error(payload.error);
  return payload as ShotState;
}

/** Kun idempotensnøkkel – ikke bruk til utfall. Trekningen skjer server-side. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return `shot-${Date.now()}-${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export const shotApi = {
  state: (tripId: string) => invoke({ action: "state", trip_id: tripId }),
  start: (tripId: string, idempotencyKey = newIdempotencyKey()) =>
    invoke({ action: "start", trip_id: tripId, idempotency_key: idempotencyKey }),
  finalize: (drawId: string) => invoke({ action: "finalize", draw_id: drawId }),
  repair: (tripId: string) => invoke({ action: "repair", trip_id: tripId }),
};
