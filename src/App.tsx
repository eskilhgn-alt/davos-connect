import * as React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout";
import { ChatLayout } from "@/layouts/ChatLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { AppBadgesProvider } from "@/hooks/useAppBadges";
import { TripProvider } from "@/contexts/TripContext";


import { errorToast } from "@/utils/errorToast";

import { Loader2 } from "lucide-react";

// Route-level splitting keeps the first mobile load small. Screens are fetched
// only when the user opens them, while Vite PWA precaches the generated chunks.
const ChatScreen = React.lazy(() => import("./pages/ChatScreen"));
const HomeScreen = React.lazy(() => import("./pages/HomeScreen"));
const MoreScreen = React.lazy(() => import("./pages/MoreScreen"));
const MapScreen = React.lazy(() => import("./pages/MapScreen"));
const CrewMapScreen = React.lazy(() => import("./pages/CrewMapScreen"));
const GalleryScreen = React.lazy(() => import("./pages/GalleryScreen"));
const WeatherScreen = React.lazy(() => import("./pages/WeatherScreen"));
const AgendaScreen = React.lazy(() => import("./pages/AgendaScreen"));
const DiscoverScreen = React.lazy(() => import("./pages/DiscoverScreen"));
const FaktasjekkerScreen = React.lazy(() => import("./pages/FaktasjekkerScreen"));
const StoriesScreen = React.lazy(() => import("./pages/StoriesScreen"));
const PollScreen = React.lazy(() => import("./pages/PollScreen"));
const RoundsScreen = React.lazy(() => import("./pages/RoundsScreen"));
const SettingsScreen = React.lazy(() => import("./pages/SettingsScreen"));
const WebcamsScreen = React.lazy(() => import("./pages/WebcamsScreen"));
const AuthScreen = React.lazy(() => import("./pages/AuthScreen"));
const AdminScreen = React.lazy(() => import("./pages/AdminScreen"));
const GroupScreen = React.lazy(() => import("./pages/GroupScreen"));
const ResetPasswordScreen = React.lazy(() => import("./pages/ResetPasswordScreen"));
const VerifyEmailScreen = React.lazy(() => import("./pages/VerifyEmailScreen"));
const OAuthConsent = React.lazy(() => import("./pages/OAuthConsent"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

// Weather prefetch is triggered in AuthContext when user is authenticated

const queryClient = new QueryClient();

const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Laster side">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, isProfileLoading, profile, isAdmin } = useAuth();

  if (isLoading || isProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If profile hasn't loaded yet, keep showing spinner – NEVER auto-logout
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Require profile completion (including avatar) and email verification
  if (!profile.full_name || !profile.nickname || !profile.avatar_url || !profile.email_verified) {
    return <Navigate to="/auth" replace />;
  }

  // Check for ban (admin can still access)
  if (profile.is_banned && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">Midlertidig utestengt</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          {profile.ban_reason || "Du er midlertidig utestengt. Kontakt admin for å få tilgang igjen."}
        </p>
      </div>
    );
  }

  // Membership must be approved before private app data is reachable.
  // Server-side RLS also enforces this — this branch just gives clear UI.
  const membershipStatus = (profile as unknown as { membership_status?: string }).membership_status;
  if (!isAdmin && membershipStatus && membershipStatus !== "approved") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">
          {membershipStatus === "banned" ? "Tilgang avvist" : "Venter på godkjenning"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          {membershipStatus === "banned"
            ? "Kontoen din er avvist. Kontakt en admin hvis du mener dette er feil."
            : "En administrator må godkjenne kontoen din før du får tilgang. Du vil bli varslet så snart det er gjort."}
        </p>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Logg ut
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

/** Admin-only wrapper — brukes for interne verktøy som Crew-kart. */
const AdminOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin, isLoading, isProfileLoading } = useAuth();
  if (isLoading || isProfileLoading) return <RouteLoading />;
  if (!isAdmin) return <Navigate to="/hjem" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <React.Suspense fallback={<RouteLoading />}>
    <Routes>
    {/* Auth routes (public) */}
    <Route path="/auth" element={<AuthScreen />} />
    <Route path="/reset-password" element={<ResetPasswordScreen />} />
    <Route path="/verify-email" element={<VerifyEmailScreen />} />
    <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
    
    
    {/* Protected routes - Chat with its own layout */}
    <Route element={<ProtectedRoute><ChatLayout /></ProtectedRoute>}>
      <Route path="/chat" element={<ChatScreen />} />
    </Route>
    
    {/* Protected routes - App layout with bottom nav */}
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<Navigate to="/hjem" replace />} />
      <Route path="/hjem" element={<HomeScreen />} />
      <Route path="/vaer" element={<WeatherScreen />} />
      <Route path="/live" element={<Navigate to="/kart?vis=status" replace />} />
      <Route path="/kart" element={<MapScreen />} />
      <Route path="/crew" element={<AdminOnly><CrewMapScreen /></AdminOnly>} />
      
      <Route path="/mer" element={<MoreScreen />} />
      <Route path="/webcams" element={<WebcamsScreen />} />
      <Route path="/forhold" element={<Navigate to="/kart?vis=status" replace />} />
      <Route path="/galleri" element={<GalleryScreen />} />
      <Route path="/innstillinger" element={<SettingsScreen />} />
      <Route path="/admin" element={<AdminScreen />} />
      
      <Route path="/agenda" element={<AgendaScreen />} />
      <Route path="/faktasjekker" element={<FaktasjekkerScreen />} />
      <Route path="/historier" element={<StoriesScreen />} />
      <Route path="/poll" element={<PollScreen />} />
      <Route path="/runder" element={<RoundsScreen />} />
      <Route path="/alle" element={<GroupScreen />} />
      {/* Fjernet permanent: /shot /tokens /casino /skred /forhold /live /webcams-redirect
          /roomies /regler /nodinfo /magnus — se prosjektkontrakt. Ukjente ruter går til NotFound. */}


    </Route>
    
      <Route path="*" element={<NotFound />} />
    </Routes>
  </React.Suspense>
);

// Prevent silent async crashes without overriding normal browser/mobile gestures.
const useGlobalErrorHandling = () => {
  React.useEffect(() => {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      errorToast("En uventet feil oppstod");
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);
};

const AppShell = () => {
  useGlobalErrorHandling();
  return (
    <>
      <Toaster />
      <Sonner />
      <OfflineIndicator />
      <BrowserRouter>
        <AuthProvider>
          <TripProvider>
            <AppBadgesProvider>
              <AppRoutes />
            </AppBadgesProvider>
          </TripProvider>
        </AuthProvider>
      </BrowserRouter>

    </>
  );
};


const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
