/**
 * ShotScreen — nøktern, etterprøvbar Shot-trekning for valgt tur.
 * Ingen poeng, tokens, premier, rangering eller straff. Helt frivillig.
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PullToRefreshWrapper } from "@/components/PullToRefreshWrapper";
import { useShotDraw } from "@/hooks/useShotDraw";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { verifyDraw, type VerificationResult } from "@/features/shot/fairness";
import { ShieldCheck, Loader2, History } from "lucide-react";

function useNames(ids: string[]) {
  const [names, setNames] = React.useState<Record<string, string>>({});
  const key = ids.slice().sort().join(",");
  React.useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nickname, full_name")
        .in("id", list);
      if (!active || !data) return;
      const map: Record<string, string> = {};
      for (const p of data as { id: string; nickname: string | null; full_name: string | null }[]) {
        map[p.id] = p.nickname || p.full_name || "Ukjent";
      }
      setNames(map);
    })();
    return () => {
      active = false;
    };
  }, [key]);
  return names;
}

const ShotScreen: React.FC = () => {
  const { user } = useAuth();
  const {
    isArchive,
    isLoading,
    isStarting,
    draw,
    participants,
    remainingMs,
    history,
    stats,
    start,
    refresh,
  } = useShotDraw();

  const [verification, setVerification] = React.useState<VerificationResult | null>(null);

  React.useEffect(() => {
    setVerification(null);
    if (!draw || draw.status !== "finalized") return;
    let active = true;
    void verifyDraw(draw, participants).then((r) => {
      if (active) setVerification(r);
    });
    return () => {
      active = false;
    };
  }, [draw, participants]);

  const names = useNames([
    ...participants.map((p) => p.user_id),
    ...history.map((h) => h.winner_id).filter(Boolean) as string[],
    ...stats.map((s) => s.user_id),
  ]);

  const seconds = Math.ceil(remainingMs / 1000);
  const counting = draw?.status === "countdown";
  const winnerName = draw?.winner_id ? names[draw.winner_id] ?? "…" : null;

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Shot" leftAction={<BackButton />} />

      <PullToRefreshWrapper
        onRefresh={refresh}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className="px-4 pt-4 space-y-6"
          style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 32px)" }}
        >
          {isLoading && (
            <div className="flex justify-center py-10" role="status" aria-label="Laster">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Live-region for skjermleser */}
          <div aria-live="polite" className="sr-only">
            {counting
              ? `Trekning om ${seconds} sekunder`
              : draw?.status === "finalized" && winnerName
                ? `${winnerName} ble trukket`
                : ""}
          </div>

          {!isLoading && (
            <section className="rounded-2xl border border-border bg-muted/40 p-5 text-center space-y-4">
              {counting ? (
                <>
                  <p className="font-heading text-sm uppercase tracking-wider text-muted-foreground">
                    Trekning pågår
                  </p>
                  <p className="font-mono text-5xl font-semibold text-foreground motion-reduce:transition-none">
                    {seconds}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Alle har 1 av {draw?.participant_count} sjanse.
                  </p>
                </>
              ) : draw?.status === "finalized" ? (
                <>
                  <p className="font-heading text-sm uppercase tracking-wider text-muted-foreground">
                    Trukket
                  </p>
                  <p className="font-heading text-2xl font-bold text-foreground">{winnerName}</p>
                  <p className="text-xs text-muted-foreground">
                    1 av {draw.participant_count}. Helt frivillig – ingen må ta noe.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ingen trekning ennå.</p>
              )}

              {!isArchive && (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={isStarting || counting}
                  className="tap-target w-full rounded-xl bg-primary px-4 py-4 font-heading text-base font-semibold text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition-transform motion-reduce:transition-none"
                >
                  {counting ? "Nedtelling …" : isStarting ? "Starter …" : "Start Shot"}
                </button>
              )}
              {isArchive && (
                <p className="text-xs text-muted-foreground">
                  Arkivert tur – kun historikk.
                </p>
              )}
            </section>
          )}

          {draw?.status === "finalized" && (
            <section className="rounded-2xl border border-border p-4 space-y-2">
              <h2 className="flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck size={14} /> Etterprøvbar rettferdighet
              </h2>
              <p className="text-xs text-muted-foreground">
                Serveren låste deltakerlisten og en hemmelig seed før nedtellingen, og
                publiserte en commitment. Etter trekningen avsløres seed-en, slik at
                hvem som helst kan regne ut vinneren på nytt.
              </p>
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                commitment: {draw.seed_commitment}
              </p>
              <p className="text-xs font-semibold text-foreground">
                {verification === null
                  ? "Verifiserer …"
                  : verification.status === "verified"
                    ? "Verifisert lokalt ✓"
                    : verification.status === "pending"
                      ? "Venter på seed"
                      : "Kunne ikke verifisere"}
              </p>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <History size={14} /> Historikk
              </h2>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {h.winner_id ? names[h.winner_id] ?? "…" : "—"}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      1/{h.participant_count} ·{" "}
                      {h.finalized_at ? new Date(h.finalized_at).toLocaleString("nb-NO") : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.length > 0 && (
            <section>
              <h2 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Statistikk
              </h2>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Kun visning. Statistikk påvirker aldri sjansene.
              </p>
              <ul className="space-y-1">
                {stats.map((s) => (
                  <li
                    key={s.user_id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs"
                  >
                    <span className={s.user_id === user?.id ? "font-semibold" : ""}>
                      {names[s.user_id] ?? "…"}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {s.times_drawn}/{s.times_in} · forventet{" "}
                      {Number(s.expected_draws).toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </PullToRefreshWrapper>
    </div>
  );
};

export default ShotScreen;
