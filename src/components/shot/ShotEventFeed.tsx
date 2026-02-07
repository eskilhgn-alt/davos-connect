/**
 * ShotEventFeed – Recent shot activity log
 */

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import type { ShotLogEntry } from "@/pages/ShotScreen";

interface ShotEventFeedProps {
  entries: ShotLogEntry[];
  getDisplayName: (id: string | null) => string;
}

const typeLabels: Record<string, { emoji: string; label: (name: string) => string }> = {
  pressed: { emoji: "🔴", label: (n) => `${n} trykket knappen` },
  countdown_started: { emoji: "⏱", label: () => "Nedtelling startet" },
  selected: { emoji: "🎯", label: (n) => `${n} ble trukket` },
  self_confirmed: { emoji: "✅", label: (n) => `${n} bekreftet: Shot tatt!` },
  witness_confirmed: { emoji: "👁", label: (n) => `${n} bekreftet som vitne` },
  overdue: { emoji: "⚠️", label: (n) => `${n} tok ikke shot i tide` },
  punished: { emoji: "💀", label: (n) => `2 straffeshots for ${n}` },
  bonus_token: { emoji: "🎁", label: (n) => `${n} fikk bonustoken` },
};

export const ShotEventFeed: React.FC<ShotEventFeedProps> = ({ entries, getDisplayName }) => {
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3">
        Siste hendelser
      </h2>
      <div className="space-y-0">
        {entries.map((entry) => {
          const config = typeLabels[entry.type] || { emoji: "•", label: () => entry.type };
          const name = getDisplayName(entry.actor_id);
          const timeAgo = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: nb });

          return (
            <div key={entry.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
              <span className="text-base mt-0.5 shrink-0">{config.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{config.label(name)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
