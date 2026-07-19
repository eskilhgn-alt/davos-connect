/**
 * GroupScreen - Shows all participants in GüttaHütte with clickable stats
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandSkeleton } from "@/components/ui/brand-skeleton";
import { BrandEmptyState } from "@/components/ui/brand-empty-state";
import { BrandAvatar } from "@/components/ui/brand-avatar";
import { BrandBadge } from "@/components/ui/brand-badge";
import { supabase } from "@/integrations/supabase/client";
import { Users, Crown, ChevronRight, Trophy, Target, Mountain } from "lucide-react";
import { UserStatsSheet, type UserStats } from "@/components/group/UserStatsSheet";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
}

export const GroupScreen: React.FC = () => {
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ["group-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, nickname, avatar_url, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: speedRecords } = useQuery({
    queryKey: ["all-speed-records"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ski_speed_records")
        .select("user_id, max_speed_kmh")
        .order("max_speed_kmh", { ascending: false });
      return (data ?? []) as SpeedRecord[];
    },
  });

  const topSpeedMap = React.useMemo(() => {
    const map = new Map<string, number>();
    speedRecords?.forEach((r) => {
      const cur = map.get(r.user_id) ?? 0;
      if (r.max_speed_kmh > cur) map.set(r.user_id, r.max_speed_kmh);
    });
    return map;
  }, [speedRecords]);

  const { data: allStats } = useQuery({
    queryKey: ["gamification-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_get_gamification_leaderboard");
      if (error) throw error;
      return (data as unknown as UserStats[]) ?? [];
    },
  });

  const statsMap = React.useMemo(() => {
    const map = new Map<string, UserStats>();
    allStats?.forEach((s) => map.set(s.user_id, s));
    return map;
  }, [allStats]);

  const getDisplayName = (p: Profile) =>
    p.nickname || p.full_name || p.email.split("@")[0];

  const getInitials = (p: Profile) => {
    const name = p.full_name || p.nickname || p.email;
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });

  const selectedProfile = profiles?.find((p) => p.id === selectedUserId);
  const selectedStats = selectedUserId ? statsMap.get(selectedUserId) ?? null : null;

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Gütta"
        subtitle={`${profiles?.length ?? "…"} medlemmer`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="p-4 space-y-2">
          {isLoading &&
            [...Array(5)].map((_, i) => (
              <BrandSkeleton key={i} className="h-20 rounded-xl" />
            ))}

          {error && (
            <BrandEmptyState
              icon={Users}
              title="Kunne ikke laste deltakere"
              description="Prøv å oppdatere siden"
            />
          )}

          {!isLoading && !error && profiles?.length === 0 && (
            <BrandEmptyState
              icon={Users}
              title="Ingen deltakere ennå"
              description="Inviter venner til GüttaHütte"
            />
          )}

          {!isLoading &&
            !error &&
            profiles?.map((profile, index) => {
              const isCreator = index === 0;
              const stats = statsMap.get(profile.id);

              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedUserId(profile.id)}
                  className="w-full text-left active:scale-[0.98] transition-transform"
                >
                  <BrandCard>
                    <BrandCardContent className="flex items-center gap-3 p-4">
                      <BrandAvatar
                        src={profile.avatar_url || undefined}
                        fallback={getInitials(profile)}
                        size="md"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-heading font-semibold text-foreground truncate">
                            {getDisplayName(profile)}
                          </p>
                          {isCreator && (
                            <BrandBadge variant="accent" className="flex items-center gap-1">
                              <Crown size={10} />
                              Opprettet
                            </BrandBadge>
                          )}
                        </div>

                        {/* Mini stats row */}
                        {stats && (
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Trophy size={10} /> {stats.total_points}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Target size={10} /> {stats.shots_selected}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Mountain size={10} /> {Math.round(stats.ski_total_vertical)}m
                            </span>
                          </div>
                        )}

                        {!stats && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            Ble med {formatDate(profile.created_at)}
                          </p>
                        )}
                      </div>

                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    </BrandCardContent>
                  </BrandCard>
                </button>
              );
            })}
        </div>
      </div>

      <UserStatsSheet
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        stats={selectedStats}
        avatarUrl={selectedProfile?.avatar_url}
        isCreator={profiles?.[0]?.id === selectedUserId}
        joinedDate={selectedProfile?.created_at}
        topSpeed={selectedUserId ? topSpeedMap.get(selectedUserId) ?? null : null}
      />
    </div>
  );
};

export default GroupScreen;
