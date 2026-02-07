/**
 * GroupScreen - Shows all participants in GüttaHütte
 * Displays member list with "created by" indicator for first member
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
import { Users, Crown } from "lucide-react";

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("nb-NO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getDisplayName = (profile: Profile) => {
    return profile.nickname || profile.full_name || profile.email.split("@")[0];
  };

  const getInitials = (profile: Profile) => {
    const name = profile.full_name || profile.nickname || profile.email;
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Gruppen"
        subtitle="Deltakere i GüttaHütte"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="p-4">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <DavosSkeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          )}

          {error && (
            <DavosEmptyState
              icon={Users}
              title="Kunne ikke laste deltakere"
              description="Prøv å oppdatere siden"
            />
          )}

          {!isLoading && !error && profiles?.length === 0 && (
            <DavosEmptyState
              icon={Users}
              title="Ingen deltakere ennå"
              description="Inviter venner til GüttaHütte"
            />
          )}

          {!isLoading && !error && profiles && profiles.length > 0 && (
            <div className="space-y-3">
              {/* First member is the creator */}
              {profiles.map((profile, index) => {
                const isCreator = index === 0;
                
                return (
                  <DavosCard key={profile.id}>
                    <DavosCardContent className="flex items-center gap-3 p-4">
                      <DavosAvatar
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
                            <DavosBadge variant="accent" className="flex items-center gap-1">
                              <Crown size={10} />
                              Opprettet
                            </DavosBadge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground truncate">
                          {profile.email}
                        </p>
                        
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          Ble med {formatDate(profile.created_at)}
                        </p>
                      </div>
                    </DavosCardContent>
                  </DavosCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupScreen;
