/**
 * TokensScreen – Tokens & topplister: balance, leaderboards, rulebook, streak
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { usePoints } from "@/hooks/usePoints";
import { useStreak } from "@/hooks/useStreak";
import { supabase } from "@/integrations/supabase/client";
import { Coins, TrendingUp, TrendingDown, Trophy, Star, Flame, BookOpen, Target, Camera, MessageCircle, Eye, Mountain } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  description: string | null;
  created_at: string;
}

interface AllTokenEntry {
  user_id: string;
  display_name: string;
  balance: number;
}

const reasonLabels: Record<string, string> = {
  round_started: "Startet runde",
  daily_refill: "Daglig påfyll",
  bonus_leader: "Lederbonustoken",
  activity_reward: "Mest aktiv i dag",
  witness_deny_penalty: "Vitne avvist shot",
  overdue_penalty: "Tidsfristen utløpt",
  ski_daily_winner: "Mest høydemeter",
  admin_adjustment: "Admin-justering",
};

const reasonIcons: Record<string, string> = {
  round_started: "🎯",
  daily_refill: "☀️",
  bonus_leader: "👑",
  activity_reward: "⚡",
  witness_deny_penalty: "👁",
  overdue_penalty: "⏰",
  ski_daily_winner: "🏔️",
  admin_adjustment: "🛡️",
};

const MEDALS = ["🥇", "🥈", "🥉"];

type Tab = "overview" | "leaderboard" | "rules";

export const TokensScreen: React.FC = () => {
  const { user } = useAuth();
  const { leaderboard, myPoints, loading: pointsLoading } = usePoints();
  const { currentStreak, bestStreak } = useStreak();
  const [balance, setBalance] = React.useState<number | null>(null);
  const [ledger, setLedger] = React.useState<LedgerEntry[]>([]);
  const [allTokens, setAllTokens] = React.useState<AllTokenEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<Tab>("overview");

  React.useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [tokensRes, ledgerRes, allTokensRes] = await Promise.all([
        supabase.rpc("rpc_get_shot_tokens"),
        supabase.from("token_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.rpc("rpc_get_all_shot_tokens"),
      ]);
      if (tokensRes.data) setBalance((tokensRes.data as any).balance);
      if (ledgerRes.data) setLedger(ledgerRes.data as unknown as LedgerEntry[]);
      if (allTokensRes.data) setAllTokens(allTokensRes.data as unknown as AllTokenEntry[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const earned = ledger.filter(e => e.delta > 0);
  const spent = ledger.filter(e => e.delta < 0);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Oversikt" },
    { id: "leaderboard", label: "Topplister" },
    { id: "rules", label: "Regelbok" },
  ];

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Tokens & topplister" leftAction={<BackButton fallbackPath="/hjem" />} />
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}>
        <div className="px-4 pt-4 pb-10 space-y-5">
          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
            {tabs.map(t => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                  tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              {/* Balance + streak */}
              <div className="flex gap-3">
                <div className="flex-1 text-center py-5 rounded-2xl border border-border bg-muted/30">
                  <Coins size={24} className="mx-auto text-foreground mb-1" />
                  <p className="font-heading text-3xl font-bold text-foreground">{loading ? "…" : balance ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">tokens</p>
                </div>
                <div className="flex-1 text-center py-5 rounded-2xl border border-border bg-muted/30">
                  <Flame size={24} className="mx-auto text-primary mb-1" />
                  <p className="font-heading text-3xl font-bold text-foreground">{currentStreak}</p>
                  <p className="text-xs text-muted-foreground mt-1">dager streak</p>
                  <p className="text-[10px] text-muted-foreground">Rekord: {bestStreak}d</p>
                </div>
              </div>

              {/* All users tokens */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Coins size={14} /> Alle tokens
                </h2>
                <div className="space-y-0">
                  {allTokens.map(entry => (
                    <div key={entry.user_id} className={cn("flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0", entry.user_id === user?.id && "bg-primary/5 rounded-lg")}>
                      <span className="text-sm text-foreground truncate">{entry.display_name}{entry.user_id === user?.id && " (deg)"}</span>
                      <span className="text-sm font-mono font-semibold text-foreground">{entry.balance}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Earned */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-success" /> Tjent ({earned.length})
                </h2>
                {earned.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Ingen ennå</p>
                ) : (
                  <div className="space-y-0">
                    {earned.map(e => (
                      <div key={e.id} className="flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{reasonIcons[e.reason] || "🪙"}</span>
                          <div>
                            <p className="text-sm text-foreground">{reasonLabels[e.reason] || e.reason}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb })}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-success">+{e.delta}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Spent */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <TrendingDown size={14} className="text-destructive" /> Brukt ({spent.length})
                </h2>
                {spent.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Ingen ennå</p>
                ) : (
                  <div className="space-y-0">
                    {spent.map(e => (
                      <div key={e.id} className="flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{reasonIcons[e.reason] || "🪙"}</span>
                          <div>
                            <p className="text-sm text-foreground">{reasonLabels[e.reason] || e.reason}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb })}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-destructive">{e.delta}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {tab === "leaderboard" && (
            <>
              {/* Points leaderboard */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Trophy size={14} className="text-primary" /> Poeng-toppliste
                </h2>
                {pointsLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Laster...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Ingen data ennå</p>
                ) : (
                  <div className="space-y-0">
                    {leaderboard.map((entry, i) => {
                      const isMe = entry.user_id === user?.id;
                      return (
                        <div key={entry.user_id} className={cn("flex items-center gap-3 py-3 px-2 border-b border-border last:border-0", isMe && "bg-primary/5 rounded-lg")}>
                          <span className="w-7 text-center text-base">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
                          <span className={cn("flex-1 text-sm truncate", isMe && "font-semibold")}>{entry.display_name}</span>
                          <span className="font-mono text-sm font-semibold flex items-center gap-1">
                            <Star size={12} className="text-primary" /> {entry.total_points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Streak leaderboard (simple) */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Flame size={14} className="text-primary" /> Din streak
                </h2>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30">
                  <div className="text-center">
                    <p className="font-heading text-2xl font-bold text-foreground">{currentStreak}</p>
                    <p className="text-xs text-muted-foreground">nåværende</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-center">
                    <p className="font-heading text-2xl font-bold text-foreground">{bestStreak}</p>
                    <p className="text-xs text-muted-foreground">rekord</p>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "rules" && (
            <div className="space-y-5">
              {/* Points rules */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Star size={14} className="text-primary" /> Poengverdier
                </h2>
                <div className="space-y-1.5">
                  {[
                    { icon: <MessageCircle size={14} />, label: "Chat-melding", points: "1p" },
                    { icon: <Camera size={14} />, label: "Bilde/video delt", points: "3p" },
                    { icon: <Target size={14} />, label: "Shot-runde startet", points: "3p" },
                    { icon: <Target size={14} />, label: "Shot tatt (bekreftet)", points: "4p" },
                    { icon: <Eye size={14} />, label: "Vitne-aktivitet (bekreftet/avslått)", points: "1p" },
                    { icon: <Camera size={14} />, label: "Story publisert", points: "2p" },
                    { icon: <Mountain size={14} />, label: "Ski: per 100m nedstigning", points: "2p" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                      <span className="text-muted-foreground">{r.icon}</span>
                      <span className="flex-1 text-sm text-foreground">{r.label}</span>
                      <span className="text-sm font-semibold text-primary">{r.points}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Token rules */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Coins size={14} /> Token-regler
                </h2>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Daglig påfyll: +1 token/dag</p>
                    <p className="text-xs mt-0.5">Automatisk refill. Ingen maks – tokens kan hordes.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Starte runde: -1 token</p>
                    <p className="text-xs mt-0.5">Koster 1 token å starte en Shoot your shot-runde.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Lederbonustoken: +1</p>
                    <p className="text-xs mt-0.5">Leder du scoreboard med 2+ shots foran, får du bonus.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Ski-vinner: +1 token ELLER frikort</p>
                    <p className="text-xs mt-0.5">Mest høydemeter i dag → du velger belønning.</p>
                  </div>
                </div>
              </section>

              {/* Shot rules */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target size={14} /> Shoot your shot – regler
                </h2>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">🎯 Trekning</p>
                    <p className="text-xs">Alle aktive brukere er med. Marginal vekting: de som nylig ble trukket har litt lavere sjanse.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">⏱ Tidsfrister</p>
                    <p className="text-xs">15 min til å ta shot. 15 min for vitne å bekrefte. Ingen cooldown – ny runde kan startes umiddelbart.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">👁 Vitne-dispute</p>
                    <p className="text-xs">Avslår vitne, velges årsak (ikke tatt, usikker, feil vitne, annet). Ingen auto-straff – admin avgjør.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">🙅 Nekting</p>
                    <p className="text-xs">Nekter du å ta shot = 2 straffeshots.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">💀 Straffeshot</p>
                    <p className="text-xs">Må tas innen 15 min. Tas det ikke → midlertidig utestengelse (kun admin kan oppheve).</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                    <p className="text-foreground font-medium">🎫 Frikort</p>
                    <p className="text-xs">Kan brukes til å stå over en shot. Tjenes ved å ha mest høydemeter i ski-tracking.</p>
                  </div>
                </div>
              </section>

              {/* Streak rules */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Flame size={14} /> Streak-system
                </h2>
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-foreground font-medium text-sm">🔥 Daglig aktivitet = streak</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send meldinger, del bilder/stories, start shot-runder eller kjør ski – alt teller. 
                    Hold streaken gående dag etter dag! Vises som widget på hjemskjermen.
                  </p>
                </div>
              </section>

              {/* Ski rules */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Mountain size={14} /> Ski-gamification
                </h2>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Registrering</p>
                    <p className="text-xs mt-0.5">Over 1500 m.o.h. og 10+ km/t → appen logger høydemeter nedover automatisk.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-foreground font-medium">Daglig vinner</p>
                    <p className="text-xs mt-0.5">Mest høydemeter (min. 100m) → velg mellom frikort eller +1 token.</p>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokensScreen;
