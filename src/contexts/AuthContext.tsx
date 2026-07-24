/**
 * Auth Context - Supabase Auth integration
 * Provides authentication state and methods throughout the app
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { oneSignalService } from "@/services/onesignal";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  isProfileLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updateProfile: (
    data: Partial<Pick<Profile, "full_name" | "nickname" | "avatar_url">>
  ) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProfileLoading, setIsProfileLoading] = React.useState(false);

  const fetchProfile = React.useCallback(async (_userId: string) => {
    try {
      // Uses SECURITY DEFINER RPC scoped to auth.uid(). Regular authenticated
      // grants on public.profiles no longer expose sensitive columns
      // (email, ban_reason, email_verified, approved_by, …) for OTHER users;
      // this RPC returns the full row only for the caller's own account.
      const { data, error } = await supabase.rpc("rpc_get_own_profile" as never);

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      const rows = (data as unknown as Profile[] | Profile | null) ?? null;
      const row = Array.isArray(rows) ? rows[0] ?? null : rows;
    } catch (err) {
      console.error("Profile fetch error:", err);
      return null;
    }
  }, []);

  const checkAdminRole = React.useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (error) {
        // If error due to RLS (user can't read roles), they're not admin
        return false;
      }

      return data !== null;
    } catch {
      return false;
    }
  }, []);

  const refreshProfile = React.useCallback(async () => {
    if (!user) return;
    setIsProfileLoading(true);
    try {
      const [profileData, admin] = await Promise.all([
        fetchProfile(user.id),
        checkAdminRole(user.id),
      ]);
      setProfile(profileData);
      setIsAdmin(admin);
    } finally {
      setIsProfileLoading(false);
    }
  }, [user, fetchProfile, checkAdminRole]);

  // Supabase stores sessions under this key in localStorage
  const STORAGE_KEY = `sb-${import.meta.env.VITE_SUPABASE_URL?.replace(/https?:\/\//, '').split('.')[0]}-auth-token`;

  const hasStoredSession = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed?.refresh_token;
    } catch {
      return false;
    }
  }, [STORAGE_KEY]);

  // Setup auth state listener
  React.useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // Prefetch weather on every auth event (login, token refresh, app wake)

        const shouldBlockForProfile = event === "SIGNED_IN" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY";
        if (shouldBlockForProfile) setIsProfileLoading(true);

        // Defer profile fetch but DON'T clear existing profile during token refresh
        setTimeout(async () => {
          if (!isMounted) return;

          const [profileData, admin] = await Promise.all([
            fetchProfile(currentSession.user.id),
            checkAdminRole(currentSession.user.id),
          ]);
          if (!isMounted) return;

          if (event === "TOKEN_REFRESHED") {
            // Avoid clearing the profile during refresh if it momentarily fails
            if (profileData) setProfile(profileData);
          } else {
            setProfile(profileData);
          }

          if (isMounted) setIsAdmin(admin);

          if (shouldBlockForProfile && isMounted) setIsProfileLoading(false);
        }, 0);
      } else {
        // CRITICAL: If we lost the session but localStorage still has one,
        // DON'T clear state — a token refresh is likely in progress or network is waking up
        if (hasStoredSession()) {
          console.warn("[Auth] Session event returned null but localStorage has session — keeping state, retrying…");
          // Retry getSession after a short delay (network might be waking up on iOS PWA)
          setTimeout(async () => {
            if (!isMounted) return;
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (!isMounted) return;
            if (retrySession?.user) {
              setSession(retrySession);
              setUser(retrySession.user);
              console.log("[Auth] Session recovered on retry");
            }
            // If still null after retry, keep existing state — don't log out
          }, 2000);
          return;
        }

        setProfile(null);
        setIsAdmin(false);
        setIsProfileLoading(false);
      }

      setIsLoading(false);
    });

    // Get initial session with retry logic for PWA cold starts
    const initSession = async (attempt = 1): Promise<void> => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!initialSession?.user && hasStoredSession() && attempt <= 3) {
        console.warn(`[Auth] getSession() returned null but localStorage has session — retry ${attempt}/3`);
        await new Promise(r => setTimeout(r, attempt * 1500));
        return initSession(attempt + 1);
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        setIsProfileLoading(true);

        const [profileData, admin] = await Promise.all([
          fetchProfile(initialSession.user.id),
          checkAdminRole(initialSession.user.id),
        ]);
        if (!isMounted) return;
        setProfile(profileData);
        if (isMounted) setIsAdmin(admin);

        if (isMounted) setIsProfileLoading(false);
      }

      setIsLoading(false);
    };

    initSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, checkAdminRole, hasStoredSession]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    return { error: error ? new Error(error.message) : null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    try {
      await oneSignalService.logout();
    } catch (error) {
      console.warn("[Auth] OneSignal logout failed", error);
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
    setIsProfileLoading(false);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    return { error: error ? new Error(error.message) : null };
  };

  const updateProfile = async (data: Partial<Pick<Profile, "full_name" | "nickname" | "avatar_url">>) => {
    if (!user) {
      return { error: new Error("Not authenticated") };
    }

    const { error } = await supabase.from("profiles").update(data).eq("id", user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error: error ? new Error(error.message) : null };
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    isAdmin,
    isLoading,
    isProfileLoading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
