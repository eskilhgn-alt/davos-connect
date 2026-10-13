import * as React from "react";
import {
  useSocialHistory,
  OlderHistory,
  EventFocus,
} from "@/features/social/history";
import type { SocialEvent } from "@/features/social/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useSocial } from "@/features/social/SocialProvider";
export default function VibeScreen() {
  const { state, loading, error, pending, act, refresh } = useSocial();
  const [place, setPlace] = React.useState("");
  const history = useSocialHistory<SocialEvent>(
    "vibe",
    state?.events.filter((e) => e.kind === "vibe") ?? [],
  );
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AppHeader title="God stemning" />
      <PullToRefreshWrapper
        onRefresh={refresh}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="space-y-5 pb-8">
          <EventFocus />
          {error && <p role="alert">{error}</p>}
          {loading && !state && <p role="status">Laster …</p>}
          {state?.writable && !state.active_vibe && (
            <section className="space-y-3">
              <label className="block" htmlFor="vibe-place">
                Hvor? (valgfritt)
              </label>
              <input
                id="vibe-place"
                maxLength={160}
                value={place}
                disabled={pending}
                onChange={(e) => setPlace(e.target.value)}
                className="min-h-12 w-full rounded-xl border bg-background p-3"
                placeholder="For eksempel ved peisen"
              />
              <button
                disabled={pending}
                onClick={() =>
                  void act({ action: "vibe_start", text: place.trim() })
                }
                className="min-h-24 w-full rounded-2xl bg-green-700 p-5 text-xl font-bold text-white disabled:opacity-50"
              >
                {pending ? "Sender …" : "God stemning"}
              </button>
              <p className="text-sm text-muted-foreground">
                Gi de andre på turen beskjed. Sted deles bare hvis du skriver
                det inn.
              </p>
            </section>
          )}
          {state?.active_vibe && (
            <section className="rounded-xl border p-4">
              <p>{state.active_vibe.body}</p>
              {state.writable && (
                <button
                  disabled={pending}
                  className="min-h-12 underline"
                  onClick={() =>
                    void act({
                      action: "vibe_end",
                      source_id: state.active_vibe!.id,
                    })
                  }
                >
                  Avslutt egen melding
                </button>
              )}
            </section>
          )}
          {state && !state.writable && (
            <p>Turen er skrivebeskyttet. Du kan lese historikken.</p>
          )}
          <h2 className="font-bold">Historikk</h2>
          {history.items.map((e) => (
            <article
              id={`event-${e.id}`}
              key={e.id}
              className="rounded-xl border p-3"
            >
              <p>{e.body}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("nb-NO")} ·{" "}
                {e.ended_at ? "Avsluttet" : "Aktiv"}
              </p>
            </article>
          ))}
          <OlderHistory history={history} />
          {state && !history.items.length && <p>Ingen meldinger ennå.</p>}
        </div>
      </PullToRefreshWrapper>
    </div>
  );
}
