/**
 * SkiPerformanceTracker — Shows daily vertical + speed per user,
 * daily winners, and clickable history. Used on Crew-kart screen.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Mountain, Gauge, Trophy, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface DailyEntry {
  user_id: string;
  display_name: string;
  vertical_meters: number;
  max_speed_kmh: number | null;
  day_date: string;
}

interface DayGroup {
  date: string;
  entries: DailyEntry[];
  topVertical: DailyEntry | null;
  topSpeed: DailyEntry | null;
}

export const SkiPerformanceTracker: React.FC = () => {
  const { user } = useAuth();
  const [days, setDays] = React.useState<DayGroup[]>([]);
  const [expandedDay, setExpandedDay] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    const [verticalRes, speedRes, profilesRes] = await Promise.all([
      supabase
        .from("ski_daily_vertical")
        .select("user_id, vertical_meters, day_date")
        .gt("vertical_meters", 0)
        .order("day_date", { ascending: false })
        .limit(200),
      supabase
        .from("ski_speed_records")
        .select("user_id, max_speed_kmh, day_date")
        .order("day_date", { ascending: false })
        .limit(200),
      supabase.from("profiles").select("id, nickname, full_name"),
    ]);

    if (!verticalRes.data || !profilesRes.data) {
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, string>(
      profilesRes.data.map((p: any) => [p.id, p.nickname || p.full_name || "Ukjent"])
    );

    const speedMap = new Map<string, number>();
    (speedRes.data || []).forEach((r: any) => {
      const key = `${r.user_id}_${r.day_date}`;
      speedMap.set(key, Number(r.max_speed_kmh));
    });

    // Group by day
    const dayMap = new Map<string, DailyEntry[]>();
    verticalRes.data.forEach((r: any) => {
      const entry: DailyEntry = {
        user_id: r.user_id,
        display_name: profileMap.get(r.user_id) || "Ukjent",
        vertical_meters: r.vertical_meters,
        max_speed_kmh: speedMap.get(`${r.user_id}_${r.day_date}`) || null,
        day_date: r.day_date,
      };
      const existing = dayMap.get(r.day_date) || [];
      existing.push(entry);
      dayMap.set(r.day_date, existing);
    });

    // Also add speed-only entries (users with speed but no vertical)
    (speedRes.data || []).forEach((r: any) => {
      const existing = dayMap.get(r.day_date) || [];
      if (!existing.find((e) => e.user_id === r.user_id)) {
        existing.push({
          user_id: r.user_id,
          display_name: profileMap.get(r.user_id) || "Ukjent",
          vertical_meters: 0,
          max_speed_kmh: Number(r.max_speed_kmh),
          day_date: r.day_date,
        });
        dayMap.set(r.day_date, existing);
      }
    });

    const dayGroups: DayGroup[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => {
        entries.sort((a, b) => b.vertical_meters - a.vertical_meters);
        const topVertical = entries.length > 0 && entries[0].vertical_meters > 0 ? entries[0] : null;
        const withSpeed = entries.filter((e) => e.max_speed_kmh && e.max_speed_kmh > 0);
        withSpeed.sort((a, b) => (b.max_speed_kmh || 0) - (a.max_speed_kmh || 0));
        const topSpeed = withSpeed.length > 0 ? withSpeed[0] : null;
        return { date, entries, topVertical, topSpeed };
      });

    setDays(dayGroups);
    // Auto-expand today
    const today = new Date().toISOString().slice(0, 10);
    if (dayGroups.some((d) => d.date === today)) {
      setExpandedDay(today);
    } else if (dayGroups.length > 0) {
      setExpandedDay(dayGroups[0].date);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    const channel = supabase
      .channel("ski-tracker-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ski_daily_vertical" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "ski_speed_records" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  if (loading) {
    return (
      <section className="px-4 py-4">
        <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Mountain size={16} /> Ski-tracker
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </section>
    );
  }

  if (days.length === 0) {
    return (
      <section className="px-4 py-4">
        <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Mountain size={16} /> Ski-tracker
        </h2>
        <p className="text-sm text-muted-foreground text-center py-4">
          Ingen skidata registrert ennå
        </p>
        <p className="text-[10px] text-muted-foreground text-center">
          Spores automatisk over 1550 m.o.h. ved fart &gt; 10 km/t
        </p>
      </section>
    );
  }

  return (
    <section className="px-4 py-4">
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Mountain size={16} /> Ski-tracker
      </h2>
      <p className="text-[10px] text-muted-foreground mb-3">
        Vertikale høydemeter &amp; toppfart · over 1550 m.o.h.
      </p>

      <div className="space-y-2">
        {days.map((day) => {
          const isExpanded = expandedDay === day.date;
          const dateObj = new Date(day.date + "T12:00:00");
          const isToday = day.date === new Date().toISOString().slice(0, 10);
          const label = isToday ? "I dag" : format(dateObj, "EEEE d. MMM", { locale: nb });

          return (
            <div key={day.date} className="rounded-xl border border-border overflow-hidden">
              {/* Day header */}
              <button
                onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground capitalize">{label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {day.topVertical && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mountain size={12} />
                      {Math.round(day.topVertical.vertical_meters)}m
                    </span>
                  )}
                  {day.topSpeed && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Gauge size={12} />
                      {day.topSpeed.max_speed_kmh?.toFixed(1)} km/t
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border">
                  {/* Winners row */}
                  {(day.topVertical || day.topSpeed) && (
                    <div className="flex gap-2 px-4 py-2 bg-primary/5">
                      {day.topVertical && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Trophy size={12} className="text-primary" />
                          <span className="text-primary font-medium">
                            Mest HM: {day.topVertical.display_name} ({Math.round(day.topVertical.vertical_meters)}m)
                          </span>
                        </div>
                      )}
                      {day.topSpeed && day.topSpeed.max_speed_kmh && day.topSpeed.max_speed_kmh > 20 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Gauge size={12} className="text-primary" />
                          <span className="text-primary font-medium">
                            Raskest: {day.topSpeed.display_name} ({day.topSpeed.max_speed_kmh.toFixed(1)} km/t)
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* All users for the day */}
                  <div className="divide-y divide-border">
                    {day.entries.map((entry) => (
                      <div
                        key={entry.user_id}
                        className={cn(
                          "flex items-center justify-between px-4 py-2.5",
                          entry.user_id === user?.id && "bg-muted/30"
                        )}
                      >
                        <span className="text-sm text-foreground">{entry.display_name}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mountain size={11} />
                            <strong className="text-foreground">{Math.round(entry.vertical_meters)}m</strong>
                          </span>
                          {entry.max_speed_kmh && entry.max_speed_kmh > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Gauge size={11} />
                              <strong className="text-foreground">{entry.max_speed_kmh.toFixed(1)} km/t</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
