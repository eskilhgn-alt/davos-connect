import * as React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { ChatLayout } from "@/layouts/ChatLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";

import { errorToast } from "@/utils/errorToast";

import { Loader2 } from "lucide-react";

// Route-level splitting keeps the first mobile load small. Screens are fetched
// only when the user opens them, while Vite PWA precaches the generated chunks.
const ChatScreen = React.lazy(() => import("./pages/ChatScreen"));
const HomeScreen = React.lazy(() => import("./pages/HomeScreen"));
const MoreScreen = React.lazy(() => import("./pages/MoreScreen"));
const MapScreen = React.lazy(() => import("./pages/MapScreen"));
const CrewMapScreen = React.lazy(() => import("./pages/CrewMapScreen"));
const LiveScreen = React.lazy(() => import("./pages/LiveScreen"));
const GalleryScreen = React.lazy(() => import("./pages/GalleryScreen"));
const WeatherScreen = React.lazy(() => import("./pages/WeatherScreen"));
const AgendaScreen = React.lazy(() => import("./pages/AgendaScreen"));
const FaktasjekkerScreen = React.lazy(() => import("./pages/FaktasjekkerScreen"));
const StoriesScreen = React.lazy(() => import("./pages/StoriesScreen"));
const PollScreen = React.lazy(() => import("./pages/PollScreen"));
const RoundsScreen = React.lazy(() => import("./pages/RoundsScreen"));
const RoomiesScreen = React.lazy(() => import("./pages/RoomiesScreen"));
const SettingsScreen = React.lazy(() => import("./pages/SettingsScreen"));
const WebcamsScreen = React.lazy(() => import("./pages/WebcamsScreen"));
const AuthScreen = React.lazy(() => import("./pages/AuthScreen"));
const AdminScreen = React.lazy(() => import("./pages/AdminScreen"));
const GroupScreen = React.lazy(() => import("./pages/GroupScreen"));
const AvalancheScreen = React.lazy(() => import("./pages/AvalancheScreen"));
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
      <Route path="/live" element={<LiveScreen />} />
      <Route path="/kart" element={<MapScreen />} />
      <Route path="/crew" element={<CrewMapScreen />} />
      
      <Route path="/mer" element={<MoreScreen />} />
      <Route path="/webcams" element={<WebcamsScreen />} />
      <Route path="/galleri" element={<GalleryScreen />} />
      <Route path="/innstillinger" element={<SettingsScreen />} />
      <Route path="/admin" element={<AdminScreen />} />
      
      <Route path="/agenda" element={<AgendaScreen />} />
      <Route path="/faktasjekker" element={<FaktasjekkerScreen />} />
      <Route path="/historier" element={<StoriesScreen />} />
      <Route path="/poll" element={<PollScreen />} />
      <Route path="/runder" element={<RoundsScreen />} />
      <Route path="/roomies" element={<RoomiesScreen />} />
      <Route path="/alle" element={<GroupScreen />} />
      <Route path="/shot" element={<Navigate to="/hjem" replace />} />
      <Route path="/tokens" element={<Navigate to="/hjem" replace />} />
      <Route path="/regler" element={<Navigate to="/hjem" replace />} />
      <Route path="/nodinfo" element={<Navigate to="/hjem" replace />} />
      <Route path="/casino" element={<Navigate to="/hjem" replace />} />
      <Route path="/skred" element={<AvalancheScreen />} />

    </Route>
    
      <Route path="*" element={<NotFound />} />
    </Routes>
  </React.Suspense>
);

// Global PWA hardening — prevents silent async crashes + browser context menu
const useGlobalPwaHardening = () => {
  React.useEffect(() => {
    // Unhandled promise rejections
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      errorToast("En uventet feil oppstod");
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    // Block browser context menu globally (long-press on mobile)
    const contextHandler = (e: MouseEvent) => {
      // Allow context menu on inputs/textareas for paste functionality
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", contextHandler);

    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      document.removeEventListener("contextmenu", contextHandler);
    };
  }, []);
};

const AppShell = () => {
  useGlobalPwaHardening();
  return (
    <>
      <Toaster />
      <Sonner />
      <OfflineIndicator />
      <BrowserRouter>
        <AuthProvider>
          
          <AppRoutes />
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
