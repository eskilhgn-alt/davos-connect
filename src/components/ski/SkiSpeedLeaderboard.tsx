/**
 * SkiSpeedLeaderboard – Shows today's top speed per user
 * Fastest user gets highlighted
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpeedEntry {
  user_id: string;
  display_name: string;
  max_speed_kmh: number;
  altitude_m: number | null;
}

export const SkiSpeedLeaderboard: React.FC = () => {
  const [data, setData] = React.useState<SpeedEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [speedRes, profilesRes] = await Promise.all([
        supabase
          .from("ski_speed_records")
          .select("user_id, max_speed_kmh, altitude_m")
          .eq("day_date", today)
          .order("max_speed_kmh", { ascending: false }),
        supabase.from("profiles").select("id, nickname, full_name"),
      ]);

      if (speedRes.data && profilesRes.data) {
        const profileMap = new Map(
          profilesRes.data.map((p: any) => [p.id, p.nickname || p.full_name || "Ukjent"])
        );

        setData(
          (speedRes.data as any[]).map((r) => ({
            user_id: r.user_id,
            display_name: profileMap.get(r.user_id) || "Ukjent",
            max_speed_kmh: Number(r.max_speed_kmh),
            altitude_m: r.altitude_m ? Number(r.altitude_m) : null,
          }))
        );
      }
      setLoading(false);
    };
    load();

    // Realtime updates
    const channel = supabase
      .channel("speed-records-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ski_speed_records" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <section>
        <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Gauge size={16} className="text-primary" /> Toppfart i dag
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </section>
    );
  }

  if (data.length === 0) {
    return (
      <section>
        <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Gauge size={16} className="text-primary" /> Toppfart i dag
        </h2>
        <p className="text-sm text-muted-foreground text-center py-4">
          Ingen fartsmålinger registrert i dag
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Gauge size={16} className="text-primary" /> Toppfart i dag
      </h2>
      <div className="space-y-0 border border-border rounded-xl overflow-hidden">
        {data.map((entry, i) => (
          <div
            key={entry.user_id}
            className={cn(
              "flex items-center justify-between py-3 px-4 border-b border-border last:border-0",
              i === 0 && "bg-primary/5"
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </span>
              <span className="text-sm font-medium text-foreground">{entry.display_name}</span>
            </div>
            <div className="text-right">
              <span className={cn(
                "font-heading text-sm font-bold tabular-nums",
                i === 0 ? "text-primary" : "text-foreground"
              )}>
                {entry.max_speed_kmh.toFixed(1)} km/t
              </span>
              {entry.altitude_m && (
                <p className="text-[10px] text-muted-foreground">{Math.round(entry.altitude_m)} m.o.h.</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {data.length > 0 && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          🏆 Raskeste bruker i dag får 1 poeng ved midnatt
        </p>
      )}
    </section>
  );
};
