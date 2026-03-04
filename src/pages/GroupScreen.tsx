/**
 * GroupScreen - Shows all participants with clickable stats (simplified)
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { DavosEmptyState } from "@/components/ui/davos-empty-state";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { DavosBadge } from "@/components/ui/davos-badge";
import { supabase } from "@/integrations/supabase/client";
import { Users, Crown, ChevronRight, MessageCircle, Target } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
}

export const GroupScreen: React.FC = () => {
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

  const getDisplayName = (p: Profile) =>
    p.nickname || p.full_name || p.email.split("@")[0];

  const getInitials = (p: Profile) => {
    const name = p.full_name || p.nickname || p.email;
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader
        title="Gütta"
        subtitle={`${profiles?.length ?? "…"} medlemmer`}
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="p-4 space-y-2">
          {isLoading && [...Array(5)].map((_, i) => <DavosSkeleton key={i} className="h-20 rounded-xl" />)}
          {error && <DavosEmptyState icon={Users} title="Kunne ikke laste deltakere" description="Prøv å oppdatere siden" />}
          {!isLoading && !error && profiles?.length === 0 && <DavosEmptyState icon={Users} title="Ingen deltakere ennå" description="Inviter venner til GüttaHütte" />}

          {!isLoading && !error && profiles?.map((profile, index) => {
            const isCreator = index === 0;
            return (
              <DavosCard key={profile.id}>
                <DavosCardContent className="flex items-center gap-3 p-4">
                  <DavosAvatar src={profile.avatar_url || undefined} fallback={getInitials(profile)} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-heading font-semibold text-foreground truncate">{getDisplayName(profile)}</p>
                      {isCreator && (
                        <DavosBadge variant="accent" className="flex items-center gap-1">
                          <Crown size={10} /> Grunnlegger
                        </DavosBadge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Ble med {formatDate(profile.created_at)}
                    </p>
                  </div>
                </DavosCardContent>
              </DavosCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GroupScreen;