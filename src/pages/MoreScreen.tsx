import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { DavosErrorState } from "@/components/ui/davos-error-state";
import { DavosListRowSkeleton } from "@/components/ui/davos-skeleton";
import { DavosListRow } from "@/components/ui/davos-list-row";
import { DavosButton } from "@/components/ui/davos-button";
import { moreMenuItems } from "@/config/moreMenu";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User } from "lucide-react";

type ScreenState = "ready" | "loading" | "error";

export const MoreScreen: React.FC = () => {
  const [state] = React.useState<ScreenState>("ready");
  const navigate = useNavigate();
  const { user, profile, isAdmin, signOut, isLoading } = useAuth();

  const handleItemClick = (path?: string) => {
    if (path) {
      navigate(path);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Filter menu items based on admin status
  const visibleItems = React.useMemo(() => {
    return moreMenuItems.filter(item => !item.requiresAdmin || isAdmin);
  }, [isAdmin]);

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader title="Mer" subtitle="Verktøy & info" />
      
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* User profile section */}
        {user && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {profile?.full_name || profile?.nickname || user.email}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <DavosButton
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </DavosButton>
            </div>
          </div>
        )}

        {/* Not logged in state */}
        {!user && !isLoading && (
          <div className="p-4 border-b border-border">
            <DavosButton
              onClick={() => navigate("/auth")}
              className="w-full"
            >
              Logg inn
            </DavosButton>
          </div>
        )}

        {state === "loading" && (
          <div className="w-full">
            {Array.from({ length: 6 }).map((_, i) => (
              <DavosListRowSkeleton key={i} />
            ))}
          </div>
        )}
        
        {state === "error" && (
          <div className="flex-1 flex items-center justify-center min-h-[50vh]">
            <DavosErrorState onRetry={() => {}} />
          </div>
        )}
        
        {state === "ready" && (
          <div className="divide-y divide-border">
            {visibleItems.map((item) => (
              <DavosListRow
                key={item.title}
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => handleItemClick(item.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MoreScreen;
