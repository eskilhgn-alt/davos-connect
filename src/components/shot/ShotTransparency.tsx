/**
 * ShotTransparency – AI-powered fairness checker popup
 */
import * as React from "react";
import { Shield, ChevronRight, Loader2, RefreshCw, Scale, Clock, Users, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const RULES = [
  {
    icon: Scale,
    title: "Vektet tilfeldig utvalg",
    desc: "Brukere som nylig er valgt har lavere sjanse. Ingen favorisering.",
  },
  {
    icon: Users,
    title: "Alle er like",
    desc: "Admin og vanlige brukere behandles identisk i algoritmen.",
  },
  {
    icon: Clock,
    title: "Token-system",
    desc: "Alle starter med 5 tokens, +1 per dag (maks 5). Ingen kan kjøpe seg fordeler.",
  },
  {
    icon: BookOpen,
    title: "Åpen kildekode",
    desc: "All spillogikk kjører i databasefunksjoner som kan revideres.",
  },
];

export const ShotTransparency: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [report, setReport] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<{
    last_update: string;
    total_rounds: number;
    active_users: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<string | null>(null);

  const runCheck = React.useCallback(async () => {
    setLoading(true);
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

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Feil ved henting av rapport");
      }

      const data = await resp.json();
      setReport(data.report);
      setMeta({
        last_update: data.last_update,
        total_rounds: data.total_rounds,
        active_users: data.active_users,
      });
      setLastChecked(new Date().toLocaleTimeString("nb-NO"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke kjøre sjekk");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run on first open
  React.useEffect(() => {
    if (open && !report && !loading) {
      runCheck();
    }
  }, [open, report, loading, runCheck]);

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
              AI-verifisert – ingen favorisering
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5" />
            Transparens & rettferdighet
          </DialogTitle>
        </DialogHeader>

        {/* Rules */}
        <div className="space-y-3 mt-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Regler
          </p>
          {RULES.map((rule) => (
            <div key={rule.title} className="flex gap-3 items-start">
              <rule.icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">{rule.title}</p>
                <p className="text-xs text-muted-foreground">{rule.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-border my-2" />

        {/* AI Report */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AI-revisjon
            </p>
            <button
              type="button"
              onClick={runCheck}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {loading ? "Analyserer..." : "Kjør sjekk"}
            </button>
          </div>

          {loading && !report ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                AI analyserer spilldata...
              </p>
            </div>
          ) : report ? (
            <div className="space-y-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {report}
              </div>
              {meta && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Totalt {meta.total_rounds} runder</span>
                  <span>{meta.active_users} aktive spillere</span>
                </div>
              )}
              {lastChecked && (
                <p className="text-[10px] text-muted-foreground">
                  Sist sjekket: {lastChecked}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
