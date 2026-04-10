/**
 * ShotTransparency – Full transparency panel showing algorithm source code + live stats
 */
import * as React from "react";
import { Shield, ChevronRight, Loader2, RefreshCw, Code2, BarChart3, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ALGORITHM_SQL = `-- Trekkalgoritmen (rpc_finalize_countdown)
-- Ingen vekting. Ingen historikk. Ren random.

SELECT p.id INTO v_winner_id
FROM profiles p
WHERE p.is_active = true
ORDER BY random()
LIMIT 1;

-- Alle aktive brukere har identisk
-- sannsynlighet: 1/N (ca. 11.1% med 9 spillere)`;

const MONSTER_SQL = `-- Monsterrunde (5% sjanse per trykk)
-- Trigges tilfeldig inne i rpc_start_shot_round.
-- Alle trekkes i tilfeldig rekkefølge.

IF random() < 0.05 THEN  -- 5% sjanse
  FOR v_member IN
    SELECT p.id FROM profiles p
    WHERE p.is_active = true
    ORDER BY random()
  LOOP ...  -- Alle får egen shot-event
END IF;`;
interface DistStat {
  display_name: string;
  times_selected: number;
  times_confirmed: number;
  times_punished: number;
  pct: string;
}

export const ShotTransparency: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"code" | "stats" | "ai">("code");
  const [stats, setStats] = React.useState<DistStat[] | null>(null);
  const [totalRounds, setTotalRounds] = React.useState(0);
  const [activeUsers, setActiveUsers] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  // AI report state
  const [report, setReport] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<string | null>(null);

  const loadStats = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc("rpc_get_shot_leaderboard", { p_group_id: "global", p_days: 9999 });
      const rows = (data as any[]) || [];
      
      // Count active users
      const { data: profiles } = await supabase.from("profiles").select("id").eq("is_active", true);
      const numActive = profiles?.length || 1;
      setActiveUsers(numActive);

      const total = rows.reduce((sum: number, r: any) => sum + (r.times_selected || 0), 0);
      setTotalRounds(total);

      // Build stats for ALL active users (including those never selected)
      const { data: allProfiles } = await supabase.from("profiles").select("id, nickname, full_name, email").eq("is_active", true);
      
      const statsMap = new Map<string, DistStat>();
      (allProfiles || []).forEach((p: any) => {
        const name = p.nickname || p.full_name || p.email;
        statsMap.set(p.id, {
          display_name: name,
          times_selected: 0,
          times_confirmed: 0,
          times_punished: 0,
          pct: total > 0 ? "0.0" : "-",
        });
      });

      rows.forEach((r: any) => {
        const existing = statsMap.get(r.user_id);
        if (existing) {
          existing.times_selected = r.times_selected || 0;
          existing.times_confirmed = r.times_confirmed || 0;
          existing.times_punished = r.times_punished || 0;
          existing.pct = total > 0 ? ((r.times_selected / total) * 100).toFixed(1) : "-";
        }
      });

      setStats(Array.from(statsMap.values()).sort((a, b) => b.times_selected - a.times_selected));
    } catch {
      toast.error("Kunne ikke laste statistikk");
    } finally {
      setLoading(false);
    }
  }, []);

  const runAiCheck = React.useCallback(async () => {
    setAiLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shot-fairness-check`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (!resp.ok) throw new Error("Feil ved henting av rapport");
      const data = await resp.json();
      setReport(data.report);
      setLastChecked(new Date().toLocaleTimeString("nb-NO"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke kjøre sjekk");
    } finally {
      setAiLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && tab === "stats" && !stats) loadStats();
    if (open && tab === "ai" && !report && !aiLoading) runAiCheck();
  }, [open, tab, stats, report, aiLoading, loadStats, runAiCheck]);

  const expectedPct = activeUsers > 0 ? (100 / activeUsers).toFixed(1) : "-";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card text-card-foreground hover:bg-muted/50 transition-colors text-left"
        >
          <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Transparens & rettferdighet</p>
            <p className="text-xs text-muted-foreground">
              Inspiser algoritmen og fordelingen selv
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5" />
            Åpen kildekode & statistikk
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mt-1">
          {([
            { key: "code", label: "Algoritme", icon: Code2 },
            { key: "stats", label: "Fordeling", icon: BarChart3 },
            { key: "ai", label: "AI-revisjon", icon: Shield },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Code tab */}
        {tab === "code" && (
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Vanlig trekning
              </p>
              <pre className="bg-muted/70 rounded-lg p-3 text-[11px] leading-relaxed overflow-x-auto font-mono text-foreground whitespace-pre">
                {ALGORITHM_SQL}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Monsterrunde
              </p>
              <pre className="bg-muted/70 rounded-lg p-3 text-[11px] leading-relaxed overflow-x-auto font-mono text-foreground whitespace-pre">
                {MONSTER_SQL}
              </pre>
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-xs font-medium text-primary">🔒 Garantier</p>
              <ul className="text-xs text-muted-foreground mt-1.5 space-y-1">
                <li>• Ingen bruker har hardkodet fordel eller ulempe</li>
                <li>• Ingen historikk-vekting – alle starter likt hver runde</li>
                <li>• Admin (Eskil) behandles identisk som alle andre</li>
                <li>• PostgreSQL <code className="text-[10px] bg-muted px-1 rounded">random()</code> = kryptografisk tilfeldig</li>
                <li>• Forventet fordeling: {expectedPct}% per spiller ({activeUsers} aktive)</li>
              </ul>
            </div>
          </div>
        )}

        {/* Stats tab */}
        {tab === "stats" && (
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Trekkfordeling (alle runder)
              </p>
              <button
                type="button"
                onClick={loadStats}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </button>
            </div>

            {loading && !stats ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <>
                <div className="text-xs text-muted-foreground mb-1">
                  Totalt <strong>{totalRounds}</strong> trekninger · <strong>{activeUsers}</strong> aktive · forventet {expectedPct}% hver
                </div>
                <div className="space-y-1.5">
                  {stats.map((s) => {
                    const pctNum = parseFloat(s.pct) || 0;
                    const isOverRepresented = totalRounds >= 10 && pctNum > parseFloat(expectedPct) * 1.5;
                    const isUnderRepresented = totalRounds >= 10 && pctNum < parseFloat(expectedPct) * 0.5;
                    return (
                      <div key={s.display_name} className="flex items-center gap-2">
                        <span className="text-xs w-20 truncate font-medium">{s.display_name}</span>
                        <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOverRepresented
                                ? "bg-destructive/60"
                                : isUnderRepresented
                                ? "bg-amber-500/60"
                                : "bg-primary/50"
                            }`}
                            style={{ width: `${Math.min(pctNum / (parseFloat(expectedPct) * 2) * 100, 100)}%` }}
                          />
                          {/* Expected line */}
                          <div
                            className="absolute top-0 bottom-0 w-px bg-foreground/30"
                            style={{ left: "50%" }}
                            title={`Forventet: ${expectedPct}%`}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums w-16 text-right text-muted-foreground">
                          {s.times_selected}× ({s.pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Stiplet linje = forventet fordeling. Rød = overtrekket, gul = undertrekket. Med færre enn ~50 runder er avvik normalt.
                </p>
              </>
            ) : null}
          </div>
        )}

        {/* AI tab */}
        {tab === "ai" && (
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                AI-revisjon (Eskil-sjekk)
              </p>
              <button
                type="button"
                onClick={runAiCheck}
                disabled={aiLoading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {aiLoading ? "Analyserer..." : "Kjør sjekk"}
              </button>
            </div>

            {aiLoading && !report ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">AI analyserer spilldata...</p>
              </div>
            ) : report ? (
              <div className="space-y-2">
                <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
                  {report}
                </div>
                {lastChecked && (
                  <p className="text-[10px] text-muted-foreground">Sist sjekket: {lastChecked}</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
