import { supabase } from "@/integrations/supabase/client";
import type {
  HistoryCursor,
  HistoryPage,
  SocialCommand,
  SocialState,
  SocialEvent,
  SocialDraw,
} from "./types";
export async function invokeSocial<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("social", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const payload = context?.clone
      ? await context
          .clone()
          .json()
          .catch(() => null)
      : null;
    throw new Error(payload?.error ?? error.message ?? "request_failed");
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const socialApi = {
  state: (tripId: string) =>
    invokeSocial<SocialState>({ action: "state", trip_id: tripId }),
  history: <T>(tripId: string, kind: string, cursor?: HistoryCursor | null) =>
    invokeSocial<HistoryPage<T>>({
      action: "history",
      trip_id: tripId,
      kind,
      before: cursor?.before,
      before_id: cursor?.id,
    }),
  event: (tripId: string, eventId: string) =>
    invokeSocial<{ event: SocialEvent; draw: SocialDraw | null }>({
      action: "event",
      trip_id: tripId,
      source_id: eventId,
    }),
  command: (tripId: string, key: string, command: SocialCommand) =>
    invokeSocial<{ id: string; committed: boolean }>({
      ...command,
      trip_id: tripId,
      key,
    }),
};
export const socialError = (e: unknown): string => {
  const key = e instanceof Error ? e.message : String(e);
  return (
    (
      {
        not_activated: "Funksjonen er ikke aktivert ennå.",
        daily_limit: "Du har brukt dagens fem starter.",
        vibe_cooldown: "Vent fem minutter mellom nye meldinger.",
        vibe_already_active: "Du har allerede en aktiv melding.",
        right_used: "Denne Headshot er allerede brukt.",
        right_expired: "Denne Headshot er utløpt.",
        already_answered: "Svaret er allerede registrert.",
        not_winner: "Bare den som fikk shot kan svare.",
        trip_read_only: "Denne turen er skrivebeskyttet.",
        not_trip_member: "Du har ikke tilgang til denne turen.",
        invalid_target: "Velg et annet aktivt medlem.",
        draw_active: "En trekning pågår allerede.",
        event_not_found: "Hendelsen finnes ikke på denne turen.",
      } as Record<string, string>
    )[key] ??
    "Kunne ikke bekrefte handlingen. Prøv igjen; samme forsøk sendes på nytt."
  );
};
