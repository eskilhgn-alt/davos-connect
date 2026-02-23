/**
 * AvalancheScreen — Official SLF avalanche forecast for the Davos region
 * With beginner-friendly explanations in Norwegian
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Mountain, AlertTriangle, ChevronDown, ChevronUp, ExternalLink,
  Compass, ArrowUp, ArrowDown, Clock, Shield, Loader2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoButton, AvalancheEducationBanner } from "@/components/avalanche/AvalancheInfoSheet";
import type { InfoTopic } from "@/components/avalanche/AvalancheInfoSheet";

/* ---------- types ---------- */
interface DangerRating {
  mainValue: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  validTimePeriod?: string;
}

interface AvalancheProblem {
  problemType: string;
  label: string;
  elevation?: { lowerBound?: string; upperBound?: string };
  aspects?: string[];
  validTimePeriod?: string;
}

interface Region {
  regionId: string;
  regionName: string;
  dangerRatings: DangerRating[];
  maxDangerLevel: number;
  maxDangerColor: string;
  maxDangerLabel: string;
  avalancheProblems: AvalancheProblem[];
  highlights: string;
  comment: string;
  snowpackComment: string;
  tendencyComment: string;
}

interface BulletinData {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  publicationTime: string | null;
  overallMaxDanger: number;
  overallMaxDangerColor: string;
  overallMaxDangerLabel: string;
  regions: Region[];
  matchedRegions: number;
  error?: string;
}

/* ---------- helpers ---------- */
const DANGER_EMOJIS: Record<number, string> = {
  0: "⚪", 1: "🟢", 2: "🟡", 3: "🟠", 4: "🔴", 5: "⚫",
};

const DANGER_BG: Record<number, string> = {
  0: "bg-muted",
  1: "bg-green-500/15",
  2: "bg-yellow-400/15",
  3: "bg-orange-500/15",
  4: "bg-red-500/15",
  5: "bg-neutral-900/80 text-white",
};

const DANGER_BORDER: Record<number, string> = {
  0: "border-muted-foreground/20",
  1: "border-green-500/30",
  2: "border-yellow-400/30",
  3: "border-orange-500/30",
  4: "border-red-500/30",
  5: "border-neutral-700",
};

const DANGER_SIMPLE: Record<number, string> = {
  0: "Ingen vurdering tilgjengelig",
  1: "Generelt trygge forhold. Du kan ferdes i fjellet, men bruk alltid sunn fornuft.",
  2: "Stort sett OK, men vær forsiktig i bratt terreng. Unngå de bratteste partiene.",
  3: "⚠️ Farlig! Skred kan utløses av én person i bratt terreng. Kun for erfarne.",
  4: "🚨 Svært farlig! Hold dere til preparerte løyper og stier.",
  5: "☠️ Ekstremt farlig! Hold dere inne eller i sikrede områder.",
};

const PROBLEM_ICONS: Record<string, string> = {
  new_snow: "❄️",
  wind_slab: "💨",
  persistent_weak_layers: "⚠️",
  wet_snow: "💧",
  gliding_snow: "🏔️",
  cornices: "🗻",
  no_distinct_avalanche_problem: "✅",
  favourable_situation: "☀️",
};

const ASPECT_LABELS: Record<string, string> = {
  N: "N", NE: "NØ", E: "Ø", SE: "SØ", S: "S", SW: "SV", W: "V", NW: "NV",
};

function formatTime(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function dangerNum(val: string): number {
  const m: Record<string, number> = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 };
  return m[val] ?? 0;
}

function dangerLbl(val: string): string {
  const m: Record<string, string> = {
    low: "Liten", moderate: "Moderat", considerable: "Betydelig", high: "Stor", very_high: "Meget stor",
    no_rating: "Ikke vurdert", no_snow: "Ingen snø",
  };
  return m[val] ?? val;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/* ---------- data hook ---------- */
function useAvalancheBulletin() {
  return useQuery<BulletinData>({
    queryKey: ["avalanche-bulletin"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("avalanche-bulletin");
      if (error) throw error;
      return data as BulletinData;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/* ---------- sub-components ---------- */

const DangerHero: React.FC<{ level: number; label: string; time: string | null }> = ({ level, label, time }) => (
  <div className={cn(
    "mx-4 mt-3 rounded-2xl border p-5 text-center relative",
    DANGER_BG[level] || DANGER_BG[0],
    DANGER_BORDER[level] || DANGER_BORDER[0],
  )}>
    <div className="absolute top-3 right-3">
      <InfoButton topic={`danger_${level}` as InfoTopic} size={14} />
    </div>
    <p className="text-4xl mb-1">{DANGER_EMOJIS[level] || "⚪"}</p>
    <p className={cn(
      "text-2xl font-bold font-heading",
      level >= 5 ? "text-white" : "text-foreground",
    )}>
      {level}/5 – {label}
    </p>
    <p className={cn(
      "text-xs mt-2 px-4 leading-relaxed",
      level >= 5 ? "text-white/80" : "text-muted-foreground",
    )}>
      {DANGER_SIMPLE[level] || ""}
    </p>
    <p className={cn(
      "text-[10px] mt-1",
      level >= 5 ? "text-white/70" : "text-muted-foreground",
    )}>
      Skredvarsel Davos-regionen
    </p>
    {time && (
      <p className={cn(
        "text-[10px] mt-2 flex items-center justify-center gap-1",
        level >= 5 ? "text-white/60" : "text-muted-foreground/70",
      )}>
        <Clock size={10} />
        Oppdatert {formatTime(time)}
      </p>
    )}
  </div>
);

const AspectRose: React.FC<{ aspects: string[] }> = ({ aspects }) => {
  const allAspects = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return (
    <div className="flex flex-wrap gap-1">
      {allAspects.map((a) => (
        <span
          key={a}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-full text-[9px] font-bold",
            aspects.includes(a)
              ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
              : "bg-muted/50 text-muted-foreground/40",
          )}
        >
          {ASPECT_LABELS[a] || a}
        </span>
      ))}
    </div>
  );
};

const ProblemCard: React.FC<{ problem: AvalancheProblem }> = ({ problem }) => {
  const infoTopic = PROBLEM_ICONS[problem.problemType] ? problem.problemType as InfoTopic : undefined;

  return (
    <div className="bg-muted/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{PROBLEM_ICONS[problem.problemType] || "⚠️"}</span>
        <span className="text-sm font-semibold text-foreground flex-1">{problem.label}</span>
        {infoTopic && <InfoButton topic={infoTopic} size={12} />}
      </div>
      {problem.elevation && (problem.elevation.lowerBound || problem.elevation.upperBound) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {problem.elevation.lowerBound && (
            <span className="flex items-center gap-0.5">
              <ArrowUp size={11} />
              over {problem.elevation.lowerBound}m
            </span>
          )}
          {problem.elevation.upperBound && (
            <span className="flex items-center gap-0.5">
              <ArrowDown size={11} />
              under {problem.elevation.upperBound}m
            </span>
          )}
          <InfoButton topic="elevation" size={11} />
        </div>
      )}
      {problem.aspects && problem.aspects.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Compass size={10} /> Utsatte himmelretninger
            <InfoButton topic="aspects" size={10} />
          </p>
          <AspectRose aspects={problem.aspects} />
        </div>
      )}
    </div>
  );
};

const RegionCard: React.FC<{ region: Region; defaultOpen?: boolean }> = ({ region, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      DANGER_BORDER[region.maxDangerLevel] || DANGER_BORDER[0],
    )}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 bg-card"
      >
        <span className="text-xl">{DANGER_EMOJIS[region.maxDangerLevel]}</span>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{region.regionName}</p>
          <p className="text-[11px] text-muted-foreground">
            Faregrad {region.maxDangerLevel}/5 – {region.maxDangerLabel}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3 bg-card/50 animate-in slide-in-from-top-1 duration-200">
          {/* Simple explanation */}
          <p className="text-xs text-foreground/80 bg-muted/30 rounded-lg p-2 leading-relaxed">
            {DANGER_SIMPLE[region.maxDangerLevel] || ""}
          </p>

          {/* Danger ratings by elevation */}
          {region.dangerRatings.length > 1 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                Faregrad etter høyde
                <InfoButton topic="elevation" size={10} />
              </p>
              {region.dangerRatings.map((dr, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span>{DANGER_EMOJIS[dangerNum(dr.mainValue)]}</span>
                  <span className="font-medium text-foreground">{dangerLbl(dr.mainValue)}</span>
                  {dr.elevation?.lowerBound && (
                    <span className="text-muted-foreground flex items-center gap-0.5">
                      <ArrowUp size={10} /> &gt;{dr.elevation.lowerBound}m
                    </span>
                  )}
                  {dr.elevation?.upperBound && (
                    <span className="text-muted-foreground flex items-center gap-0.5">
                      <ArrowDown size={10} /> &lt;{dr.elevation.upperBound}m
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Avalanche problems */}
          {region.avalancheProblems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Skredproblemer
              </p>
              {region.avalancheProblems.map((p, i) => (
                <ProblemCard key={i} problem={p} />
              ))}
            </div>
          )}

          {/* Textual descriptions */}
          {region.highlights && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Hovedbudskap</p>
              <p className="text-xs text-foreground leading-relaxed">{stripHtml(region.highlights)}</p>
            </div>
          )}
          {region.comment && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Skredaktivitet</p>
              <p className="text-xs text-foreground/80 leading-relaxed">{stripHtml(region.comment)}</p>
            </div>
          )}
          {region.snowpackComment && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Snødekke</p>
              <p className="text-xs text-foreground/80 leading-relaxed">{stripHtml(region.snowpackComment)}</p>
            </div>
          )}
          {region.tendencyComment && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Tendens</p>
              <p className="text-xs text-foreground/80 leading-relaxed">{stripHtml(region.tendencyComment)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ---------- main ---------- */
const AvalancheScreen: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useAvalancheBulletin();

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Skredvarsel"
        subtitle="Offisielt SLF-varsel for Davos"
        leftAction={<BackButton fallbackPath="/hjem" />}
        rightAction={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="tap-target flex items-center justify-center text-muted-foreground"
            aria-label="Oppdater"
          >
            <RefreshCw size={18} className={cn(isFetching && "animate-spin")} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto overscroll-contain pb-safe">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Henter skredvarsel fra SLF…</p>
          </div>
        )}

        {error && !data && (
          <div className="m-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center space-y-2">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">Kunne ikke hente skredvarsel</p>
            <p className="text-xs text-muted-foreground">Sjekk internett-tilkoblingen og prøv igjen.</p>
            <button onClick={() => refetch()} className="text-xs text-primary font-medium mt-2">
              Prøv igjen
            </button>
          </div>
        )}

        {data && !data.error && (
          <div className="space-y-4 pb-8">
            {/* Hero danger level */}
            <DangerHero
              level={data.overallMaxDanger}
              label={data.overallMaxDangerLabel}
              time={data.publicationTime || data.fetchedAt}
            />

            {/* Education banner for beginners */}
            <AvalancheEducationBanner />

            {/* Safety banner for high danger */}
            {data.overallMaxDanger >= 3 && (
              <div className={cn(
                "mx-4 rounded-xl border p-3 flex items-start gap-3",
                data.overallMaxDanger >= 4 ? "bg-red-500/10 border-red-500/30" : "bg-orange-500/10 border-orange-500/30",
              )}>
                <Shield size={18} className={data.overallMaxDanger >= 4 ? "text-red-500 shrink-0 mt-0.5" : "text-orange-500 shrink-0 mt-0.5"} />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">
                    {data.overallMaxDanger >= 4
                      ? "⚠️ Stor eller meget stor skredfare!"
                      : "Betydelig skredfare i området"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.overallMaxDanger >= 4
                      ? "Unngå alt bratt terreng utenfor preparerte løyper. Naturlige skred er sannsynlige."
                      : "Skred kan utløses av enkeltpersoner i bratt terreng. Vurder nøye før dere beveger dere utenfor løypene."}
                  </p>
                </div>
                <InfoButton topic={`danger_${data.overallMaxDanger}` as InfoTopic} size={14} />
              </div>
            )}

            {/* Danger scale legend */}
            <div className="mx-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                Europeisk fareskala
                <InfoButton topic="danger_scale" size={10} />
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <div
                    key={lvl}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-center text-[10px] font-bold border transition-all",
                      data.overallMaxDanger === lvl ? "scale-110 shadow-md" : "opacity-50",
                      DANGER_BG[lvl],
                      DANGER_BORDER[lvl],
                      lvl === 5 ? "text-white" : "text-foreground",
                    )}
                  >
                    {lvl}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[8px] text-muted-foreground">Liten</span>
                <span className="text-[8px] text-muted-foreground">Meget stor</span>
              </div>
            </div>

            {/* Safety tips shortcut */}
            <div className="mx-4">
              <div className="flex items-center gap-2 rounded-xl bg-muted/40 border border-border p-3">
                <span className="text-lg">🛡️</span>
                <p className="text-xs text-foreground/80 flex-1">
                  Husk alltid skredutstyr utenfor løypene: sender/mottaker, spade og søkestang.
                </p>
                <InfoButton topic="safety_tips" size={14} />
              </div>
            </div>

            {/* Regions */}
            <div className="mx-4 space-y-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Mountain size={11} />
                Varslingsregioner ({data.regions.length})
              </p>
              {data.regions.map((region, i) => (
                <RegionCard key={region.regionId} region={region} defaultOpen={i === 0} />
              ))}
            </div>

            {/* Source & links */}
            <div className="mx-4 space-y-2 pt-2">
              <a
                href="https://whiterisk.ch/en/conditions"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 bg-muted rounded-xl text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
              >
                <ExternalLink size={13} />
                Åpne White Risk (full detalj)
              </a>
              <p className="text-[10px] text-center text-muted-foreground">
                Kilde: {data.source} · CC BY 4.0
              </p>
              <p className="text-[10px] text-center text-muted-foreground/60">
                Skredvarselet er veiledende. Vurder alltid lokale forhold selv.
              </p>
            </div>
          </div>
        )}

        {data?.error && (
          <div className="m-4 p-4 rounded-xl bg-muted text-center space-y-2">
            <Mountain className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Ingen aktiv skredvarsel tilgjengelig akkurat nå.
            </p>
            <p className="text-xs text-muted-foreground/70">
              SLF publiserer daglig i vintersesongen (nov–mai).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvalancheScreen;
