/**
 * AdminScreen - User management dashboard
 * Only accessible to admin users
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosBadge } from "@/components/ui/davos-badge";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { 
  Users, 
  Search, 
  Shield, 
  ShieldOff, 
  UserX, 
  UserCheck,
  RefreshCw,
  Loader2,
  ArrowLeft
} from "lucide-react";
import { toast } from "sonner";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
  created_at: string;
  role: "user" | "admin";
}

export const AdminScreen: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [users, setUsers] = React.useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Redirect non-admins
  React.useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error("Ingen tilgang");
      navigate("/");
    }
  }, [isAdmin, authLoading, navigate]);

  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine data
      const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      
      const usersWithRoles: UserWithRole[] = (profiles || []).map(p => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        nickname: p.nickname,
        is_active: p.is_active,
        created_at: p.created_at,
        role: (rolesMap.get(p.id) as "user" | "admin") || "user",
      }));

      setUsers(usersWithRoles);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast.error("Kunne ikke hente brukere");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin, fetchUsers]);

  const toggleRole = async (userId: string, currentRole: "user" | "admin") => {
    setActionLoading(userId);
    try {
      if (currentRole === "admin") {
        // Remove admin role
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        
        toast.success("Adminrolle fjernet");
      } else {
        // Add admin role
        await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        
        toast.success("Adminrolle lagt til");
      }
      
      await fetchUsers();
    } catch (err) {
      console.error("Role toggle failed:", err);
      toast.error("Kunne ikke endre rolle");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    setActionLoading(userId);
    try {
      await supabase
        .from("profiles")
        .update({ is_active: !isActive })
        .eq("id", userId);
      
      toast.success(isActive ? "Bruker deaktivert" : "Bruker aktivert");
      await fetchUsers();
    } catch (err) {
      console.error("Active toggle failed:", err);
      toast.error("Kunne ikke endre status");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return users;
    
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      u.email.toLowerCase().includes(query) ||
      u.full_name?.toLowerCase().includes(query) ||
      u.nickname?.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader 
        title="Admin" 
        subtitle={`${users.length} brukere`}
        leftAction={
          <button onClick={() => navigate("/mer")} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
      />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Search & Actions */}
        <div className="p-4 space-y-4 sticky top-0 bg-background z-10 border-b border-border">
          <div className="flex gap-2">
            <DavosInput
              type="search"
              placeholder="Søk brukere..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <DavosButton
              variant="outline"
              onClick={fetchUsers}
              disabled={isLoading}
            >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            </DavosButton>
          </div>
        </div>

        {/* User List */}
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <DavosSkeleton key={i} className="h-24 w-full" />
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Ingen brukere funnet</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <DavosCard key={user.id}>
                <DavosCardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-foreground truncate">
                          {user.full_name || user.email}
                        </p>
                        {user.role === "admin" && (
                          <DavosBadge variant="accent">Admin</DavosBadge>
                        )}
                        {!user.is_active && (
                          <DavosBadge variant="critical">Inaktiv</DavosBadge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                      {user.nickname && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Kallenavn: {user.nickname}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Registrert: {new Date(user.created_at).toLocaleDateString("nb-NO")}
                      </p>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <DavosButton
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRole(user.id, user.role)}
                        disabled={actionLoading === user.id}
                        title={user.role === "admin" ? "Fjern admin" : "Gjør admin"}
                      >
                        {actionLoading === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : user.role === "admin" ? (
                          <ShieldOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <Shield className="h-4 w-4" />
                        )}
                      </DavosButton>
                      
                      <DavosButton
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(user.id, user.is_active)}
                        disabled={actionLoading === user.id}
                        title={user.is_active ? "Deaktiver" : "Aktiver"}
                      >
                        {actionLoading === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : user.is_active ? (
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-secondary" />
                        )}
                      </DavosButton>
                    </div>
                  </div>
                </DavosCardContent>
              </DavosCard>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminScreen;
