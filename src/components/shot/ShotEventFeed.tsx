/**
 * ShotEventFeed – Recent shot activity log (with dispute entries)
 */

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import type { ShotLogEntry } from "@/pages/ShotScreen";

interface ShotEventFeedProps {
  entries: ShotLogEntry[];
  getDisplayName: (id: string | null) => string;
}

const typeLabels: Record<string, { emoji: string; label: (name: string, payload?: Record<string, unknown>) => string }> = {
  pressed: { emoji: "🔴", label: (n) => `${n} trykket på den store knappen – ny runde startet!` },
  countdown_started: { emoji: "⏱", label: (n) => `Nedtelling startet – 10 sekunder til trekning. Hvem blir det?` },
  selected: { emoji: "🎯", label: (n) => `${n} ble trukket ut og må ta shot innen 15 minutter!` },
  self_confirmed: { emoji: "✅", label: (n) => `${n} sier shotten er tatt – venter nå på at vitnet bekrefter.` },
  witness_confirmed: { emoji: "👁", label: (n, p) => {
    const target = (p as any)?.target_name;
    return target ? `${n} bekreftet som vitne at ${target} tok shotten. Godkjent!` : `${n} bekreftet som vitne – shotten er godkjent!`;
  }},
  witness_disputed: { emoji: "⚠️", label: (n, p) => {
    const reason = (p as any)?.reason || "ukjent grunn";
    return `${n} avviste shotten som vitne! Grunn: "${reason}". Admin må avgjøre.`;
  }},
  witness_denied: { emoji: "🚫", label: (n) => `${n} avviste shotten – saken er sendt til admin.` },
  witness_timeout: { emoji: "⏰", label: () => "Vitnet svarte ikke innen fristen – automatisk straffeshot utdelt." },
  refused: { emoji: "🙅", label: (n) => `${n} nektet å ta shotten – dobbel straff!` },
  overdue: { emoji: "⚠️", label: (n) => `${n} tok ikke shotten innen fristen på 15 minutter.` },
  punished: { emoji: "💀", label: (n, p) => {
    const reason = (p as any)?.reason === 'refused' ? "nektet å ta shot" : "ikke tatt i tide";
    return `Straff utdelt til ${n} – ${reason}.`;
  }},
  admin_confirmed: { emoji: "🛡️", label: () => "Admin har avgjort: shotten godkjennes – ingen straff." },
  admin_punished: { emoji: "🛡️", label: () => "Admin har avgjort: straffeshot utdelt!" },
  bonus_token: { emoji: "🎁", label: (n) => `${n} fikk et bonustoken som belønning.` },
  banned: { emoji: "🚫", label: (n) => `${n} er midlertidig utestengt fra Shoot your shot.` },
  frikort_used: { emoji: "🎫", label: (n) => `${n} brukte et frikort og slipper denne runden.` },
};

export const ShotEventFeed: React.FC<ShotEventFeedProps> = ({ entries, getDisplayName }) => {
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3">Siste hendelser</h2>
      <div className="space-y-0">
        {entries.map((entry) => {
          const config = typeLabels[entry.type] || { emoji: "•", label: () => entry.type };
          const name = getDisplayName(entry.actor_id);
          const payload = entry.payload as Record<string, unknown> | undefined;
          const timeAgo = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: nb });
          return (
            <div key={entry.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
              <span className="text-base mt-0.5 shrink-0">{config.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{config.label(name, payload)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
