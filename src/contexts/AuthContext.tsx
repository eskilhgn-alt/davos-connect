/**
 * Auth Context - Supabase Auth integration
 * Provides authentication state and methods throughout the app
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { prefetchWeatherAiSummary } from "@/hooks/useWeatherAiSummary";
import type { User, Session } from "@supabase/supabase-js";

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

  const fetchProfile = React.useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      return data as Profile | null;
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
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
      const admin = await checkAdminRole(user.id);
      setIsAdmin(admin);
    } finally {
      setIsProfileLoading(false);
    }
  }, [user, fetchProfile, checkAdminRole]);

  // Setup auth state listener
  React.useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!isMounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // Prefetch weather on every auth event (login, token refresh, app wake)
        prefetchWeatherAiSummary();

        const shouldBlockForProfile = event === "SIGNED_IN" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY";
        if (shouldBlockForProfile) setIsProfileLoading(true);

        // Defer profile fetch but DON'T clear existing profile during token refresh
        setTimeout(async () => {
          if (!isMounted) return;

          const profileData = await fetchProfile(currentSession.user.id);
          if (!isMounted) return;

          if (event === "TOKEN_REFRESHED") {
            // Avoid clearing the profile during refresh if it momentarily fails
            if (profileData) setProfile(profileData);
          } else {
            setProfile(profileData);
          }

          const admin = await checkAdminRole(currentSession.user.id);
          if (isMounted) setIsAdmin(admin);

          if (shouldBlockForProfile && isMounted) setIsProfileLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsProfileLoading(false);
      }

      setIsLoading(false);
    });

    // Get initial session
    (async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        setIsProfileLoading(true);
        // Kick off weather prefetch as early as possible
        prefetchWeatherAiSummary();

        const profileData = await fetchProfile(initialSession.user.id);
        if (!isMounted) return;
        setProfile(profileData);

        const admin = await checkAdminRole(initialSession.user.id);
        if (isMounted) setIsAdmin(admin);

        if (isMounted) setIsProfileLoading(false);
      }

      setIsLoading(false);
    })();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, checkAdminRole]);

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
