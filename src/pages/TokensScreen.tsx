/**
 * TokensScreen – Shows token balance, earning history, spending history, and activity awards
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Coins, TrendingUp, TrendingDown, Gift, Trophy } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  description: string | null;
  created_at: string;
  user_id: string;
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
};

const reasonIcons: Record<string, string> = {
  round_started: "🎯",
  daily_refill: "☀️",
  bonus_leader: "👑",
  activity_reward: "⚡",
  witness_deny_penalty: "👁",
  overdue_penalty: "⏰",
  ski_daily_winner: "🏔️",
};

export const TokensScreen: React.FC = () => {
  const { user } = useAuth();
  const [balance, setBalance] = React.useState<number | null>(null);
  const [ledger, setLedger] = React.useState<LedgerEntry[]>([]);
  const [allTokens, setAllTokens] = React.useState<AllTokenEntry[]>([]);
  const [activityAwards, setActivityAwards] = React.useState<LedgerEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [tokensRes, ledgerRes, allTokensRes] = await Promise.all([
        supabase.rpc("rpc_get_shot_tokens"),
        supabase
          .from("token_ledger")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.rpc("rpc_get_all_shot_tokens"),
      ]);
      if (tokensRes.data) setBalance((tokensRes.data as any).balance);
      if (ledgerRes.data) setLedger(ledgerRes.data as unknown as LedgerEntry[]);
      if (allTokensRes.data) setAllTokens(allTokensRes.data as unknown as AllTokenEntry[]);
      setLoading(false);
    };
    load();
  }, [user]);

  // Load activity awards across all users
  React.useEffect(() => {
    const loadAwards = async () => {
      const { data } = await supabase
        .from("token_ledger")
        .select("*")
        .eq("reason", "activity_reward")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setActivityAwards(data as unknown as LedgerEntry[]);
    };
    loadAwards();
  }, []);

  const earned = ledger.filter((e) => e.delta > 0);
  const spent = ledger.filter((e) => e.delta < 0);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Tokens" leftAction={<BackButton fallbackPath="/hjem" />} />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "var(--bottom-nav-h-effective)", WebkitOverflowScrolling: "touch" }}
      >
        <div className="px-4 pt-6 pb-10 space-y-6">
          {/* Balance card */}
          <div className="text-center py-6 rounded-2xl border border-border bg-muted/30">
            <Coins size={28} className="mx-auto text-foreground mb-2" />
            <p className="font-heading text-4xl font-bold text-foreground">
              {loading ? "…" : balance ?? 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">av 5 tokens</p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full",
                    balance != null && i < balance ? "bg-foreground" : "bg-border"
                  )}
                />
              ))}
            </div>
          </div>

          {/* All users token overview */}
          <section>
            <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Coins size={14} />
              Alle brukeres tokens
            </h2>
            {allTokens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Ingen data</p>
            ) : (
              <div className="space-y-0">
                {allTokens.map((entry) => (
                  <div
                    key={entry.user_id}
                    className={cn(
                      "flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0",
                      entry.user_id === user?.id && "bg-primary/5 rounded-lg"
                    )}
                  >
                    <span className="text-sm text-foreground truncate">
                      {entry.display_name}
                      {entry.user_id === user?.id && " (deg)"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < entry.balance ? "bg-foreground" : "bg-border"
                          }`}
                        />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                        {entry.balance}/5
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Activity awards across all users */}
          {activityAwards.length > 0 && (
            <section>
              <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-warning" />
                Mest aktiv – bonustoken
              </h2>
              <div className="space-y-0">
                {activityAwards.map((e) => {
                  const awardUser = allTokens.find(t => t.user_id === e.user_id);
                  return (
                    <div key={e.id} className="flex items-center justify-between py-2 px-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-foreground">
                          ⚡ {awardUser?.display_name || "Ukjent"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-success">+1</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* How to earn */}
          <section>
            <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Gift size={14} />
              Slik tjener du tokens
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-foreground font-medium shrink-0">+1</span>
                <span>Daglig påfyll (automatisk hver dag)</span>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-foreground font-medium shrink-0">+1</span>
                <span>Leder scoreboard med 2+ shots</span>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-foreground font-medium shrink-0">+1</span>
                <span>Mest aktiv bruker i dag (meldinger, bilder, agenda)</span>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <span className="text-foreground font-medium shrink-0">🎫</span>
                <span>Mest høydemeter i dag → frikort eller +1 token (du velger!)</span>
              </div>
            </div>
          </section>

          {/* Earned */}
          <section>
            <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-success" />
              Tjent ({earned.length})
            </h2>
            {earned.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Ingen ennå</p>
            ) : (
              <div className="space-y-0">
                {earned.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{reasonIcons[e.reason] || "🪙"}</span>
                      <div>
                        <p className="text-sm text-foreground">{reasonLabels[e.reason] || e.reason}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb })}
                        </p>
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
              <TrendingDown size={14} className="text-destructive" />
              Brukt ({spent.length})
            </h2>
            {spent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Ingen ennå</p>
            ) : (
              <div className="space-y-0">
                {spent.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 px-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{reasonIcons[e.reason] || "🪙"}</span>
                      <div>
                        <p className="text-sm text-foreground">{reasonLabels[e.reason] || e.reason}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(e.created_at), "d. MMM HH:mm", { locale: nb })}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-destructive">{e.delta}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TokensScreen;
