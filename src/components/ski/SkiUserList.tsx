/**
 * SkiUserList — Clickable list of all users with ski stats summary.
 * Used in CrewMapScreen (Magnus?) to view per-user ski data.
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BrandAvatar } from "@/components/ui/brand-avatar";
import { Mountain, Gauge, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkiUserStatsSheet, type SkiUserData } from "./SkiUserStatsSheet";

interface Profile {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface VerticalRow {
  user_id: string;
  vertical_meters: number;
  day_date: string;
}

interface SpeedRow {
  user_id: string;
  max_speed_kmh: number;
  day_date: string;
}

export const SkiUserList: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = React.useState<SkiUserData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedUser, setSelectedUser] = React.useState<SkiUserData | null>(null);

  React.useEffect(() => {
    async function load() {
      const [profilesRes, verticalRes, speedRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, nickname, full_name, avatar_url")
          .eq("is_active", true),
        supabase
          .from("ski_daily_vertical")
          .select("user_id, vertical_meters, day_date")
          .gt("vertical_meters", 0)
          .order("day_date", { ascending: false })
          .limit(500),
        supabase
          .from("ski_speed_records")
          .select("user_id, max_speed_kmh, day_date")
          .order("day_date", { ascending: false })
          .limit(500),
      ]);

      if (!profilesRes.data) {
        setLoading(false);
        return;
      }

      const profiles = profilesRes.data as Profile[];
      const verticals = (verticalRes.data ?? []) as VerticalRow[];
      const speeds = (speedRes.data ?? []) as SpeedRow[];
      const today = new Date().toISOString().slice(0, 10);

      const userData: SkiUserData[] = profiles.map((p) => {
        const userVerticals = verticals.filter((v) => v.user_id === p.id);
        const userSpeeds = speeds.filter((s) => s.user_id === p.id);

        const totalVertical = userVerticals.reduce(
          (sum, v) => sum + v.vertical_meters,
          0
        );
        const activeDays = new Set(userVerticals.map((v) => v.day_date)).size;
        const todayVertical = userVerticals
          .filter((v) => v.day_date === today)
          .reduce((sum, v) => sum + v.vertical_meters, 0);

        const topSpeed =
          userSpeeds.length > 0
            ? Math.max(...userSpeeds.map((s) => Number(s.max_speed_kmh)))
            : null;

        // Build speed map by day
        const speedByDay = new Map<string, number>();
        userSpeeds.forEach((s) => {
          const cur = speedByDay.get(s.day_date) ?? 0;
          if (Number(s.max_speed_kmh) > cur)
            speedByDay.set(s.day_date, Number(s.max_speed_kmh));
        });

        // Merge daily entries from both vertical and speed data
        const allDays = new Set([
          ...userVerticals.map((v) => v.day_date),
          ...userSpeeds.map((s) => s.day_date),
        ]);

        const dailyEntries = Array.from(allDays)
          .sort((a, b) => b.localeCompare(a))
          .map((day) => ({
            day_date: day,
            vertical_meters:
              userVerticals
                .filter((v) => v.day_date === day)
                .reduce((s, v) => s + v.vertical_meters, 0),
            max_speed_kmh: speedByDay.get(day) ?? null,
          }));

        return {
          user_id: p.id,
          display_name: p.nickname || p.full_name || "Ukjent",
          avatar_url: p.avatar_url,
          total_vertical: totalVertical,
          active_days: activeDays,
          today_vertical: todayVertical,
          top_speed: topSpeed,
          daily_entries: dailyEntries,
        };
      });

      // Sort: users with data first, then by total vertical desc
      userData.sort((a, b) => {
        if (a.total_vertical === 0 && b.total_vertical > 0) return 1;
        if (b.total_vertical === 0 && a.total_vertical > 0) return -1;
        return b.total_vertical - a.total_vertical;
      });

      setUsers(userData);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <section className="px-4 py-4">
        <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users size={16} /> Ski-stats per bruker
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-4">
      <h2 className="font-heading text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Users size={16} /> Ski-stats per bruker
      </h2>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {users.map((u) => {
          const isMe = u.user_id === user?.id;
          return (
            <button
              key={u.user_id}
              onClick={() => setSelectedUser(u)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left",
                "hover:bg-muted/50 active:bg-muted transition-colors",
                isMe && "bg-muted/20"
              )}
            >
              <BrandAvatar
                src={u.avatar_url || undefined}
                fallback={u.display_name}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {u.display_name}
                  {isMe && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (deg)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Mountain size={10} /> {Math.round(u.total_vertical)}m
                  </span>
                  {u.top_speed && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Gauge size={10} /> {Math.round(u.top_speed)} km/t
                    </span>
                  )}
                  {u.total_vertical === 0 && !u.top_speed && (
                    <span className="text-[10px] text-muted-foreground/60">
                      Ingen data ennå
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                size={14}
                className="text-muted-foreground shrink-0"
              />
            </button>
          );
        })}
      </div>

      <SkiUserStatsSheet
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        data={selectedUser}
      />
    </section>
  );
};
