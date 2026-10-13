import * as React from "react";
import {
  useSocialHistory,
  OlderHistory,
  EventFocus,
} from "@/features/social/history";
import type { SocialDraw } from "@/features/social/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useAuth } from "@/contexts/AuthContext";
import { useSocial } from "@/features/social/SocialProvider";
import { remainingMs } from "@/features/shot/types";
import { verifyDraw } from "@/features/shot/fairness";
export default function SocialShotScreen() {
  const { user } = useAuth();
  const { state, loading, error, pending, act, refresh, receivedAt } =
    useSocial();
  const [now, setNow] = React.useState(Date.now());
  const [today, setToday] = React.useState(true);
  const [target, setTarget] = React.useState("");
  const [proof, setProof] = React.useState("");
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const draw =
    state?.draws.find((d) => d.status === "countdown") ?? state?.draws[0];
  const seconds =
    draw && state
      ? Math.ceil(
          remainingMs(draw.draw_at, state.server_now, receivedAt, now) / 1000,
        )
      : 0;
  const right = state?.rights.find(
    (r) =>
      !r.consumed_by &&
      Date.parse(r.expires_at) >
        Date.parse(state.server_now) + (now - receivedAt),
  );
  const name = (id: string | null) =>
    state?.members.find((m) => m.id === id)?.name ?? "Et medlem";
  React.useEffect(() => {
    setTarget("");
  }, [state?.trip_id, right?.id]);
  React.useEffect(() => {
    let active = true;
    setProof("");
    if (draw?.kind === "draw" && draw.status === "finalized" && state) {
      void verifyDraw(
        draw,
        state.participants.filter((p) => p.draw_id === draw.id),
      )
        .then((r) => {
          if (active)
            setProof(
              r.ok
                ? "Trekningen er etterprøvd."
                : "Kunne ikke etterprøve trekningen.",
            );
        })
        .catch(() => {
          if (active) setProof("Kunne ikke etterprøve trekningen.");
        });
    }
    return () => {
      active = false;
    };
  }, [draw, state?.participants]);
  const history = useSocialHistory<SocialDraw>("draws", state?.draws ?? []);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AppHeader title="Shot your shot" />
      <PullToRefreshWrapper
        onRefresh={refresh}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="space-y-5 pb-8">
          <EventFocus />
          {error && <p role="alert">{error}</p>}
          {loading && !state && <p role="status">Laster …</p>}
          <p className="text-sm text-muted-foreground">
            Helt frivillig. Ingen må ta noe.
          </p>
          {draw?.status === "countdown" && (
            <section
              aria-live="polite"
              className="rounded-2xl border p-5 text-center"
            >
              <p className="text-5xl font-mono">{seconds || "…"}</p>
              <p>{seconds ? "Trekning pågår" : "Venter på serverresultatet"}</p>
              <p>Alle har 1 av {draw.participant_count} sjanse.</p>
            </section>
          )}
          {state?.writable && (
            <button
              disabled={
                pending ||
                draw?.status === "countdown" ||
                state.starts_today >= 5
              }
              onClick={() => void act({ action: "shot_start" })}
              className="min-h-24 w-full rounded-2xl bg-red-700 p-5 text-xl font-bold text-white disabled:opacity-50"
            >
              {pending ? "Starter …" : "Shot your shot"}
            </button>
          )}
          {state && (
            <p className="text-sm">
              {state.writable
                ? `${5 - state.starts_today} av 5 starter igjen i dag.`
                : "Turen er skrivebeskyttet."}
            </p>
          )}
          {right && state?.writable && (
            <section className="rounded-xl border p-4 space-y-3">
              <h2 className="font-bold">Din Headshot i dag</h2>
              <label className="block" htmlFor="headshot-target">
                Velg et annet medlem
              </label>
              <select
                id="headshot-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="min-h-12 w-full rounded-lg border bg-background p-2"
              >
                <option value="">Velg person</option>
                {state.members
                  .filter((m) => m.id !== user?.id)
                  .map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <button
                disabled={pending || !target}
                className="min-h-12 w-full rounded-xl bg-red-700 p-3 text-white disabled:opacity-50"
                onClick={() =>
                  void act({
                    action: "headshot",
                    source_id: right.id,
                    target_id: target,
                  })
                }
              >
                Headshot
              </button>
            </section>
          )}
          {draw?.status === "finalized" && (
            <section className="rounded-xl border p-4">
              <p className="text-xl font-bold">
                {name(draw.winner_id)} fikk{" "}
                {draw.kind === "headshot" ? "Headshot" : "shot"}
              </p>
              {proof && (
                <p className="text-xs text-muted-foreground">{proof}</p>
              )}
            </section>
          )}
          <section>
            <h2 className="font-bold">Logg</h2>
            {history.items
              .filter((d) => d.status === "finalized")
              .map((d) => (
                <article key={d.id} className="my-2 rounded-xl border p-3">
                  <p>
                    {name(d.winner_id)} ·{" "}
                    {d.kind === "headshot" ? "Headshot" : "Tilfeldig trekning"}
                  </p>
                  <time className="text-xs">
                    {new Date(d.finalized_at!).toLocaleString("nb-NO")}
                  </time>
                  <p>
                    {d.response === "taken"
                      ? "Tok shot"
                      : d.response === "declined"
                        ? "Feiget ut"
                        : "Venter på svar"}
                  </p>
                  {state.writable &&
                    d.winner_id === user?.id &&
                    !d.response && (
                      <div className="flex gap-3">
                        {(["taken", "declined"] as const).map((answer) => (
                          <button
                            key={answer}
                            disabled={pending}
                            className="min-h-12 flex-1 rounded-lg border p-2"
                            onClick={() =>
                              void act({
                                action: "respond",
                                source_id: d.id,
                                text: answer,
                              })
                            }
                          >
                            {answer === "taken" ? "Tok shot" : "Feiget ut"}
                          </button>
                        ))}
                      </div>
                    )}
                </article>
              ))}
            <OlderHistory history={history} />
          </section>
          <section>
            <h2 className="font-bold">Mottatte shot</h2>
            <div className="flex gap-3">
              {[true, false].map((day) => (
                <button
                  key={String(day)}
                  aria-pressed={today === day}
                  className="min-h-11 underline"
                  onClick={() => setToday(day)}
                >
                  {day ? "I dag" : "Hele turen"}
                </button>
              ))}
            </div>
            {state?.stats.map((s) => {
              const draws = Number(today ? s.draws_today : s.draws),
                headshots = Number(today ? s.headshots_today : s.headshots),
                total = draws + headshots;
              const max = Math.max(
                1,
                ...state.stats.map(
                  (x) =>
                    Number(today ? x.draws_today : x.draws) +
                    Number(today ? x.headshots_today : x.headshots),
                ),
              );
              return (
                <div key={s.user_id} className="my-3">
                  <p>
                    {name(s.user_id)}: {total} ({draws} trekninger + {headshots}{" "}
                    Headshot)
                  </p>
                  <div
                    role="img"
                    aria-label={`${total} mottatte shot`}
                    className="h-3 rounded bg-muted"
                  >
                    <div
                      className="h-3 rounded bg-red-700"
                      style={{ width: `${(100 * total) / max}%` }}
                    />
                  </div>
                  <p className="text-xs">
                    Tok: {today ? s.taken_today : s.taken} · Feiget ut:{" "}
                    {today ? s.declined_today : s.declined}
                  </p>
                </div>
              );
            })}
          </section>
        </div>
      </PullToRefreshWrapper>
    </div>
  );
}
